"""Guest access tokens for external subtasks.

A token grants access to exactly one subtask, is stored only as a digest, and
stops working the moment the subtask leaves an active status.
"""
from datetime import datetime, timezone

from sqlalchemy.orm import Session

from ..config import PUBLIC_BASE_URL
from ..constants import SubtaskStatus, TokenStatus
from ..models import ExternalAccessToken, Subtask
from ..security import digest_guest_token, issue_guest_token


def issue(db: Session, subtask: Subtask, issued_by_id: int | None) -> tuple[ExternalAccessToken, str]:
    """Revoke any live token for this subtask and mint a fresh one.

    Returns the row and the plaintext, which is the only moment the plaintext
    exists. Callers must hand it straight to the notification service or the UI.
    """
    revoke_all(db, subtask.id, reason="regenerated")
    plaintext, digest, prefix = issue_guest_token()
    row = ExternalAccessToken(
        subtask_id=subtask.id,
        token_hash=digest,
        prefix=prefix,
        issued_by_id=issued_by_id,
        status=TokenStatus.ACTIVE,
    )
    db.add(row)
    db.flush()
    return row, plaintext


def link_for(plaintext: str) -> str:
    return f"{PUBLIC_BASE_URL.rstrip('/')}/external/subtask/{plaintext}"


def resolve(db: Session, plaintext: str) -> tuple[ExternalAccessToken, Subtask] | None:
    """Look a token up by digest and confirm it is still usable.

    Returns None for unknown, revoked, consumed, expired tokens and for tokens
    whose subtask has been resolved or closed. The caller must not distinguish
    between these cases in its response.
    """
    if not plaintext or len(plaintext) > 200:
        return None
    row = (
        db.query(ExternalAccessToken)
        .filter(ExternalAccessToken.token_hash == digest_guest_token(plaintext))
        .first()
    )
    if not row or row.status != TokenStatus.ACTIVE:
        return None

    now = datetime.now(timezone.utc)
    if row.expires_at:
        expires = row.expires_at
        if expires.tzinfo is None:
            expires = expires.replace(tzinfo=timezone.utc)
        if expires < now:
            return None

    subtask = db.get(Subtask, row.subtask_id)
    if not subtask or subtask.status not in SubtaskStatus.ACTIVE:
        return None

    row.last_used_at = now
    return row, subtask


def revoke_all(db: Session, subtask_id: int, *, reason: str) -> int:
    rows = (
        db.query(ExternalAccessToken)
        .filter(
            ExternalAccessToken.subtask_id == subtask_id,
            ExternalAccessToken.status == TokenStatus.ACTIVE,
        )
        .all()
    )
    now = datetime.now(timezone.utc)
    for row in rows:
        row.status = TokenStatus.CONSUMED if reason == "completed" else TokenStatus.REVOKED
        row.revoked_at = now
    return len(rows)


def status_for(db: Session, subtask_id: int) -> dict:
    """Token state for the subtask card, without ever exposing the token."""
    row = (
        db.query(ExternalAccessToken)
        .filter(ExternalAccessToken.subtask_id == subtask_id)
        .order_by(ExternalAccessToken.id.desc())
        .first()
    )
    if not row:
        return {"state": "none", "prefix": None, "issued_at": None, "last_used_at": None}
    return {
        "state": row.status,
        "prefix": row.prefix,
        "issued_at": row.issued_at.isoformat() if row.issued_at else None,
        "last_used_at": row.last_used_at.isoformat() if row.last_used_at else None,
    }
