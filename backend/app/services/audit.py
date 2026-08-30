"""Audit trail. Every meaningful transition lands here."""
import json

from sqlalchemy.orm import Session

from ..constants import ActorKind
from ..models import AuditEvent, User


def record(
    db: Session,
    *,
    action: str,
    actor: User | None = None,
    actor_name: str | None = None,
    actor_kind: str = ActorKind.USER,
    ticket_id: int | None = None,
    subtask_id: int | None = None,
    details: dict | str | None = None,
) -> AuditEvent:
    if isinstance(details, dict):
        details = json.dumps(details, ensure_ascii=False)
    event = AuditEvent(
        ticket_id=ticket_id,
        subtask_id=subtask_id,
        actor_kind=actor_kind,
        actor_id=actor.id if actor else None,
        actor_name=actor_name or (actor.full_name if actor else "מערכת"),
        action=action,
        details=details,
    )
    db.add(event)
    return event


def system(db: Session, *, action: str, **kwargs) -> AuditEvent:
    return record(db, action=action, actor_kind=ActorKind.SYSTEM, actor_name="מערכת", **kwargs)


def external(db: Session, *, action: str, actor_name: str, **kwargs) -> AuditEvent:
    return record(
        db, action=action, actor_kind=ActorKind.EXTERNAL, actor_name=actor_name, **kwargs)
