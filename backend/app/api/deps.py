"""Authentication and authorization dependencies.

Every protected route depends on one of these. Nothing about the caller's
identity or role is ever taken from the request body or the frontend.
"""
from fastapi import Depends, Header, HTTPException, Request
from sqlalchemy.orm import Session

from ..config import GUEST_RATE_LIMIT, LOGIN_RATE_LIMIT
from ..constants import Role, TicketStatus
from ..db import get_db
from ..models import Ticket, User
from ..security import decode_token, rate_limit_exceeded


def current_user(
    authorization: str | None = Header(default=None),
    db: Session = Depends(get_db),
) -> User:
    if not authorization or not authorization.lower().startswith("bearer "):
        raise HTTPException(401, "נדרשת התחברות")
    try:
        payload = decode_token(authorization.split(" ", 1)[1])
        user_id = int(payload["sub"])
    except (ValueError, KeyError, TypeError):
        raise HTTPException(401, "פג תוקף ההתחברות")
    user = db.get(User, user_id)
    if not user or not user.active:
        raise HTTPException(401, "המשתמש אינו פעיל")
    return user


def require_roles(*roles: str):
    allowed = set(roles)

    def guard(user: User = Depends(current_user)) -> User:
        if user.role not in allowed:
            raise HTTPException(403, "אין לך הרשאה לפעולה זו")
        return user

    return guard


require_staff = require_roles(Role.RESOLVER, Role.APPROVER, Role.ADMIN)
require_operational = require_roles(Role.RESOLVER, Role.ADMIN)
require_admin = require_roles(Role.ADMIN)


def visible_ticket(ticket_id: int, user: User, db: Session) -> Ticket:
    """Fetch a ticket the caller is allowed to see, or 404.

    Returning 404 rather than 403 for tickets belonging to someone else avoids
    confirming that a given ticket id exists (IDOR probing).
    """
    ticket = db.get(Ticket, ticket_id)
    if not ticket:
        raise HTTPException(404, "הקריאה לא נמצאה")
    if user.role == Role.ADMIN:
        return ticket
    if user.role == Role.REQUESTER:
        if ticket.requester_id != user.id:
            raise HTTPException(404, "הקריאה לא נמצאה")
        return ticket
    # resolver / approver: assigned to them, opened by them, or awaiting their approval
    if ticket.resolver_id == user.id or ticket.requester_id == user.id:
        return ticket
    from ..models import Approval  # local import avoids a cycle at module load
    approves = (
        db.query(Approval)
        .filter(Approval.ticket_id == ticket.id, Approval.approver_id == user.id)
        .first()
    )
    if approves:
        return ticket
    raise HTTPException(404, "הקריאה לא נמצאה")


def can_work_ticket(ticket: Ticket, user: User) -> bool:
    if user.role == Role.ADMIN:
        return True
    return user.role == Role.RESOLVER and ticket.resolver_id == user.id


def assert_can_work(ticket: Ticket, user: User) -> None:
    if not can_work_ticket(ticket, user):
        raise HTTPException(403, "הקריאה אינה מוקצית אליך")


def client_key(request: Request, suffix: str = "") -> str:
    forwarded = request.headers.get("x-forwarded-for", "")
    ip = forwarded.split(",")[0].strip() if forwarded else (
        request.client.host if request.client else "unknown")
    return f"{ip}:{suffix}"


def login_rate_limit(request: Request) -> None:
    limit, window = LOGIN_RATE_LIMIT
    if rate_limit_exceeded(client_key(request, "login"), limit, window):
        raise HTTPException(429, "יותר מדי ניסיונות התחברות. נסו שוב בעוד מספר דקות.")


def guest_rate_limit(request: Request) -> None:
    limit, window = GUEST_RATE_LIMIT
    if rate_limit_exceeded(client_key(request, "guest"), limit, window):
        raise HTTPException(429, "יותר מדי בקשות. נסו שוב בעוד מספר דקות.")
