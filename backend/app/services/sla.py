"""SLA computation.

How long a ticket may take is decided by how urgent it is, which is the thing a
requester and a resolver both already reason about. State is derived, never
stored, so changing a target does not rewrite history -- an open ticket moves to
the new target, a closed one keeps the verdict it earned.
"""
from datetime import datetime, timedelta, timezone

from sqlalchemy.orm import Session

from ..constants import Priority, SlaState, TicketStatus
from ..models import Category, Setting, Ticket

AT_RISK_FRACTION = 0.75

SETTING_KEYS = {
    Priority.URGENT: "sla.hours_urgent",
    Priority.HIGH: "sla.hours_high",
    Priority.NORMAL: "sla.hours_normal",
    Priority.LOW: "sla.hours_low",
}

# Two hours, one day, three days, one week.
DEFAULT_PRIORITY_HOURS = {
    Priority.URGENT: 2,
    Priority.HIGH: 24,
    Priority.NORMAL: 72,
    Priority.LOW: 168,
}


def hours_for(db: Session, priority: str, category: Category | None = None) -> int | None:
    """The target for one ticket, in hours.

    Priority decides it. A category's own sla_hours is the fallback for a
    priority with no configured target, so an existing per-category commitment
    is not lost, but it no longer overrides urgency.
    """
    key = SETTING_KEYS.get(priority)
    if key:
        row = db.get(Setting, key)
        if row and (row.value or "").strip():
            try:
                hours = int(float(row.value))
                if hours > 0:
                    return hours
            except ValueError:
                pass                       # a bad value falls through, never crashes intake
        default = DEFAULT_PRIORITY_HOURS.get(priority)
        if default:
            return default
    return category.sla_hours if category and category.sla_hours else None


def due_at(
    db: Session, category: Category | None, start: datetime, priority: str,
) -> datetime | None:
    hours = hours_for(db, priority, category)
    if not hours:
        return None
    return start + timedelta(hours=hours)


def state_for(ticket: Ticket, now: datetime | None = None) -> str:
    """ok | at_risk | breached | met | none"""
    if not ticket.sla_due_at:
        return SlaState.NONE
    now = now or datetime.now(timezone.utc)
    due = ticket.sla_due_at
    if due.tzinfo is None:
        due = due.replace(tzinfo=timezone.utc)

    if ticket.status in TicketStatus.CLOSED:
        resolved = ticket.resolved_at or now
        if resolved.tzinfo is None:
            resolved = resolved.replace(tzinfo=timezone.utc)
        return SlaState.MET if resolved <= due else SlaState.BREACHED

    if now > due:
        return SlaState.BREACHED

    created = ticket.created_at
    if created.tzinfo is None:
        created = created.replace(tzinfo=timezone.utc)
    total = (due - created).total_seconds()
    elapsed = (now - created).total_seconds()
    if total > 0 and elapsed / total >= AT_RISK_FRACTION:
        return SlaState.AT_RISK
    return SlaState.OK


def minutes_remaining(ticket: Ticket, now: datetime | None = None) -> int | None:
    if not ticket.sla_due_at:
        return None
    now = now or datetime.now(timezone.utc)
    due = ticket.sla_due_at
    if due.tzinfo is None:
        due = due.replace(tzinfo=timezone.utc)
    return int((due - now).total_seconds() // 60)
