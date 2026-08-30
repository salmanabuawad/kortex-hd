from datetime import datetime, timezone

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from .. import schemas
from ..constants import ApprovalStatus, ApprovalTrigger, Events, Role
from ..db import get_db
from ..models import Approval, User
from ..services import approvals as approval_service
from ..services import audit, notifications
from ..services.notifications import Recipient
from .deps import assert_can_work, current_user, require_staff, visible_ticket
from . import serializers as S

router = APIRouter(prefix="/api", tags=["approvals"])


@router.get("/approvals")
def list_approvals(
    status: str = "pending",
    user: User = Depends(require_staff),
    db: Session = Depends(get_db),
):
    query = db.query(Approval)
    if status and status != "all":
        query = query.filter(Approval.status == status)
    # An approver sees only what is addressed to them; admins see everything.
    if user.role == Role.APPROVER:
        query = query.filter(Approval.approver_id == user.id)
    elif user.role == Role.RESOLVER:
        query = query.filter(
            (Approval.approver_id == user.id) | (Approval.requested_by_id == user.id))
    rows = query.order_by(Approval.requested_at.desc()).all()
    return {"items": [S.approval(r) for r in rows]}


@router.get("/tickets/{ticket_id}/approvals")
def ticket_approvals(
    ticket_id: int,
    user: User = Depends(current_user),
    db: Session = Depends(get_db),
):
    ticket = visible_ticket(ticket_id, user, db)
    rows = db.query(Approval).filter(
        Approval.ticket_id == ticket.id).order_by(Approval.id).all()
    return {"items": [S.approval(r) for r in rows]}


@router.post("/tickets/{ticket_id}/approvals", status_code=201)
def request_approval(
    ticket_id: int,
    data: schemas.ApprovalRequestIn,
    user: User = Depends(require_staff),
    db: Session = Depends(get_db),
):
    """Manual approval request raised by a resolver."""
    ticket = visible_ticket(ticket_id, user, db)
    assert_can_work(ticket, user)

    approver_id = data.approver_id or (
        ticket.category.escalation_id if ticket.category else None)
    if not approver_id:
        raise HTTPException(400, "לא הוגדר מאשר לקטגוריה. בחרו מאשר.")
    approver = db.get(User, approver_id)
    if not approver or not approver.active:
        raise HTTPException(400, "המאשר שנבחר אינו זמין")

    approval = Approval(
        ticket_id=ticket.id,
        reason=data.reason.strip(),
        trigger=ApprovalTrigger.MANUAL,
        amount=ticket.estimated_cost,
        hours=ticket.estimated_hours,
        requested_by_id=user.id,
        approver_id=approver.id,
    )
    db.add(approval)
    approval_service.refresh_ticket_state(db, ticket)
    db.flush()
    audit.record(db, action="approval_requested", actor=user, ticket_id=ticket.id,
                 details={"reason": approval.reason, "approver": approver.full_name})
    notifications.emit(db, Events.APPROVAL_REQUESTED,
                       recipients=[Recipient.from_user(approver)],
                       ticket=ticket, context={"reason": approval.reason})
    db.commit()
    db.refresh(approval)
    return S.approval(approval)


@router.post("/approvals/{approval_id}/decision")
def decide(
    approval_id: int,
    data: schemas.ApprovalDecision,
    user: User = Depends(require_staff),
    db: Session = Depends(get_db),
):
    approval = db.get(Approval, approval_id)
    if not approval:
        raise HTTPException(404, "בקשת האישור לא נמצאה")
    if approval.status != ApprovalStatus.PENDING:
        raise HTTPException(400, "הבקשה כבר הוכרעה")
    # Only the named approver, or an admin, may decide.
    if user.role != Role.ADMIN and approval.approver_id != user.id:
        raise HTTPException(403, "הבקשה אינה ממתינה להחלטתך")
    if data.decision not in (ApprovalStatus.APPROVED, ApprovalStatus.REJECTED,
                             ApprovalStatus.CANCELLED):
        raise HTTPException(400, "החלטה לא חוקית")

    approval.status = data.decision
    approval.decision_note = (data.note or "").strip() or None
    approval.decided_at = datetime.now(timezone.utc)

    ticket = approval.ticket
    approval_service.refresh_ticket_state(db, ticket)
    audit.record(db, action="approval_decision", actor=user, ticket_id=ticket.id,
                 details={"decision": data.decision, "note": approval.decision_note})
    db.flush()

    decision_label = {
        ApprovalStatus.APPROVED: "אושר",
        ApprovalStatus.REJECTED: "נדחה",
        ApprovalStatus.CANCELLED: "בוטל",
    }[data.decision]
    notifications.emit(
        db, Events.APPROVAL_DECIDED,
        recipients=[Recipient.from_user(ticket.resolver),
                    Recipient.from_user(approval.requested_by)],
        ticket=ticket,
        context={"decision": decision_label, "note": approval.decision_note or ""})
    db.commit()
    db.refresh(approval)
    return S.approval(approval)
