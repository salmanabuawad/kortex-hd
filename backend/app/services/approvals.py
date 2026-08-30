"""Approval rule evaluation.

Two sources of truth, evaluated together:
  * the category's own thresholds (the common case, edited on the category page)
  * workflow_rules rows (extra rules an admin composes in the workflow builder)

Both produce the same shape, so the caller does not care which fired.
"""
from dataclasses import dataclass
from decimal import Decimal

from sqlalchemy.orm import Session

from ..constants import ApprovalStatus, ApprovalTrigger, TicketApprovalState
from ..models import Approval, Category, Ticket, WorkflowRule


@dataclass
class Trigger:
    kind: str
    reason: str
    approver_id: int | None


def _as_decimal(value) -> Decimal | None:
    return None if value is None else Decimal(str(value))


def evaluate(db: Session, ticket: Ticket, category: Category) -> list[Trigger]:
    """Which approval rules does this ticket trip?"""
    triggers: list[Trigger] = []
    cost = _as_decimal(ticket.estimated_cost)
    hours = _as_decimal(ticket.estimated_hours)
    rt_key = ticket.request_type.key if ticket.request_type else None

    cost_threshold = _as_decimal(category.cost_threshold)
    if cost_threshold is not None and cost is not None and cost > cost_threshold:
        triggers.append(Trigger(
            ApprovalTrigger.COST,
            f"עלות משוערת {cost:,.0f} ₪ חורגת מסף האישור בקטגוריה ({cost_threshold:,.0f} ₪)",
            category.escalation_id))

    hours_threshold = _as_decimal(category.hours_threshold)
    if hours_threshold is not None and hours is not None and hours > hours_threshold:
        triggers.append(Trigger(
            ApprovalTrigger.HOURS,
            f"היקף עבודה משוער {hours:g} שעות חורג מסף האישור ({hours_threshold:g} שעות)",
            category.escalation_id))

    if category.approval_new_service and rt_key == "new_service":
        triggers.append(Trigger(
            ApprovalTrigger.NEW_SERVICE,
            "בקשה לשירות חדש בקטגוריה המחייבת אישור",
            category.escalation_id))

    rules = (
        db.query(WorkflowRule)
        .filter(WorkflowRule.active.is_(True))
        .order_by(WorkflowRule.sort_order, WorkflowRule.id)
        .all()
    )
    for rule in rules:
        if rule.category_id and rule.category_id != ticket.category_id:
            continue
        if rule.request_type_id and rule.request_type_id != ticket.request_type_id:
            continue
        rule_cost = _as_decimal(rule.cost_gt)
        if rule_cost is not None and (cost is None or cost <= rule_cost):
            continue
        rule_hours = _as_decimal(rule.hours_gt)
        if rule_hours is not None and (hours is None or hours <= rule_hours):
            continue
        # A rule with no condition at all would fire on everything; treat that
        # as a misconfiguration rather than a catch-all.
        if rule.category_id is None and rule.request_type_id is None \
                and rule_cost is None and rule_hours is None:
            continue
        triggers.append(Trigger(
            ApprovalTrigger.MANUAL,
            f"כלל תהליך: {rule.name}",
            rule.approver_id or category.escalation_id))

    return triggers


def apply(db: Session, ticket: Ticket, category: Category, requested_by_id: int | None) -> list[Approval]:
    """Create pending approvals for whatever the ticket trips. Idempotent per
    trigger kind: re-running will not stack duplicates onto one ticket."""
    existing = {
        a.trigger for a in db.query(Approval).filter(
            Approval.ticket_id == ticket.id,
            Approval.status == ApprovalStatus.PENDING,
        )
    }
    created: list[Approval] = []
    for trigger in evaluate(db, ticket, category):
        if trigger.kind in existing:
            continue
        approval = Approval(
            ticket_id=ticket.id,
            reason=trigger.reason,
            trigger=trigger.kind,
            amount=ticket.estimated_cost,
            hours=ticket.estimated_hours,
            requested_by_id=requested_by_id,
            approver_id=trigger.approver_id,
            status=ApprovalStatus.PENDING,
        )
        db.add(approval)
        created.append(approval)
        existing.add(trigger.kind)

    if created:
        ticket.approval_state = TicketApprovalState.PENDING
    elif ticket.approval_state == TicketApprovalState.NONE:
        ticket.approval_state = TicketApprovalState.NONE
    return created


def refresh_ticket_state(db: Session, ticket: Ticket) -> None:
    """Ticket approval state is a roll-up of its approval rows."""
    rows = db.query(Approval).filter(Approval.ticket_id == ticket.id).all()
    if not rows:
        ticket.approval_state = TicketApprovalState.NONE
        return
    if any(r.status == ApprovalStatus.PENDING for r in rows):
        ticket.approval_state = TicketApprovalState.PENDING
    elif any(r.status == ApprovalStatus.REJECTED for r in rows):
        ticket.approval_state = TicketApprovalState.REJECTED
    elif any(r.status == ApprovalStatus.APPROVED for r in rows):
        ticket.approval_state = TicketApprovalState.APPROVED
    else:
        ticket.approval_state = TicketApprovalState.NONE
