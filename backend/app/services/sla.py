"""SLA computation. Targets come from the category; state is derived, never stored,
so changing a target does not require rewriting history."""
from datetime import datetime, timedelta, timezone

from ..constants import SlaState, TicketStatus
from ..models import Category, Ticket

AT_RISK_FRACTION = 0.75


def due_at(category: Category, start: datetime) -> datetime | None:
    if not category.sla_hours:
        return None
    return start + timedelta(hours=category.sla_hours)


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
