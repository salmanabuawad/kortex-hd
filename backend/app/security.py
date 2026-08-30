"""Passwords, session tokens, and guest-link tokens."""
import hashlib
import hmac
import secrets
import time
from collections import defaultdict, deque
from datetime import datetime, timedelta, timezone

from jose import JWTError, jwt
from passlib.context import CryptContext

from .config import JWT_SECRET as SECRET, TOKEN_TTL_HOURS

ALGORITHM = "HS256"
pwd_context = CryptContext(schemes=["bcrypt"], deprecated="auto")

MIN_PASSWORD_LENGTH = 10


def hash_password(password: str) -> str:
    return pwd_context.hash(password)


def verify_password(password: str, hashed: str) -> bool:
    try:
        return pwd_context.verify(password, hashed)
    except ValueError:
        return False


def password_problem(password: str) -> str | None:
    """Returns a Hebrew complaint, or None when the password is acceptable."""
    if len(password) < MIN_PASSWORD_LENGTH:
        return f"הסיסמה חייבת להכיל לפחות {MIN_PASSWORD_LENGTH} תווים"
    if password.isdigit() or password.isalpha():
        return "הסיסמה חייבת לשלב אותיות ומספרים"
    return None


def create_token(user_id: int, role: str) -> str:
    exp = datetime.now(timezone.utc) + timedelta(hours=TOKEN_TTL_HOURS)
    return jwt.encode({"sub": str(user_id), "role": role, "exp": exp}, SECRET, algorithm=ALGORITHM)


def decode_token(token: str) -> dict:
    try:
        return jwt.decode(token, SECRET, algorithms=[ALGORITHM])
    except JWTError as exc:
        raise ValueError("invalid token") from exc


# --- guest tokens -----------------------------------------------------------
# The plaintext token is shown to the resolver once and mailed to the external
# assignee. Only the digest is persisted, so the database never holds a working
# link. Lookup is by digest, which stays an indexed equality search.

def issue_guest_token() -> tuple[str, str, str]:
    """Returns (plaintext, digest, prefix)."""
    plaintext = secrets.token_urlsafe(32)
    return plaintext, digest_guest_token(plaintext), plaintext[:8]


def digest_guest_token(plaintext: str) -> str:
    return hashlib.sha256(plaintext.encode("utf-8")).hexdigest()


def tokens_equal(a: str, b: str) -> bool:
    return hmac.compare_digest(a, b)


# --- rate limiting ----------------------------------------------------------
# In-process sliding window. Adequate for a single-host deployment; swap for
# Redis if the API is ever run on more than one machine.

_hits: dict[str, deque] = defaultdict(deque)


def rate_limit_exceeded(key: str, limit: int, window_seconds: int) -> bool:
    now = time.monotonic()
    window = _hits[key]
    while window and now - window[0] > window_seconds:
        window.popleft()
    if len(window) >= limit:
        return True
    window.append(now)
    return False


def reset_rate_limit(key: str) -> None:
    _hits.pop(key, None)
