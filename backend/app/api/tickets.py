"""Ticket lifecycle: create, view, work, transfer, resolve, reject, reopen."""
from datetime import datetime, timezone

from fastapi import APIRouter, Depends, File, HTTPException, Query, UploadFile
from sqlalchemy import or_
from sqlalchemy.orm import Session

from .. import schemas
from ..constants import Events, Priority, Role, TicketApprovalState, TicketStatus
from ..db import get_db
from ..models import (
    Approval, Category, Subtask, Ticket, TicketAssignment, TicketAttachment, TicketComment,
    AuditEvent, User,
)
from ..services import approvals as approval_service
from ..services import audit, files, notifications, sla, tokens
from ..services.notifications import Recipient
from .deps import assert_can_work, current_user, require_staff, visible_ticket
from . import serializers as S

router = APIRouter(prefix="/api/tickets", tags=["tickets"])


def _next_number(db: Session, ticket_id: int) -> str:
    return f"{datetime.now(timezone.utc).strftime('%y%m')}{ticket_id:05d}"


def _base_query(db: Session, user: User):
    q = db.query(Ticket)
    if user.role == Role.REQUESTER:
        return q.filter(Ticket.requester_id == user.id)
    if user.role == Role.RESOLVER:
        return q.filter(or_(Ticket.resolver_id == user.id, Ticket.requester_id == user.id))
    if user.role == Role.APPROVER:
        approved_ids = db.query(Approval.ticket_id).filter(Approval.approver_id == user.id)
        return q.filter(or_(
            Ticket.requester_id == user.id,
            Ticket.id.in_(approved_ids),
        ))
    return q                                       # admin


@router.get("")
def list_tickets(
    user: User = Depends(current_user),
    db: Session = Depends(get_db),
    q: str | None = None,
    status: str | None = None,
    category_id: int | None = None,
    priority: str | None = None,
    resolver_id: int | None = None,
    request_type_id: int | None = None,
    sla_state: str | None = None,
    scope: str | None = Query(default=None, description="mine | unassigned | approval"),
    page: int = Query(default=1, ge=1),
    page_size: int = Query(default=25, ge=1, le=100),
):
    query = _base_query(db, user)

    if q:
        like = f"%{q.strip()}%"
        query = query.filter(or_(
            Ticket.subject.ilike(like),
            Ticket.number.ilike(like),
            Ticket.description.ilike(like),
        ))
    if status:
        wanted = [s for s in status.split(",") if s]
        if wanted == ["open"]:
            query = query.filter(Ticket.status.in_(list(TicketStatus.OPEN)))
        elif wanted == ["closed"]:
            query = query.filter(Ticket.status.in_(list(TicketStatus.CLOSED)))
        else:
            query = query.filter(Ticket.status.in_(wanted))
    if category_id:
        query = query.filter(Ticket.category_id == category_id)
    if priority:
        query = query.filter(Ticket.priority == priority)
    if request_type_id:
        query = query.filter(Ticket.request_type_id == request_type_id)
    if resolver_id and user.role in (Role.ADMIN, Role.RESOLVER, Role.APPROVER):
        query = query.filter(Ticket.resolver_id == resolver_id)
    if scope == "mine" and user.role != Role.REQUESTER:
        query = query.filter(Ticket.resolver_id == user.id)
    elif scope == "unassigned":
        query = query.filter(Ticket.resolver_id.is_(None))
    elif scope == "approval":
        query = query.filter(Ticket.approval_state == TicketApprovalState.PENDING)

    total = query.count()
    rows = (
        query.order_by(Ticket.updated_at.desc(), Ticket.id.desc())
        .offset((page - 1) * page_size)
        .limit(page_size)
        .all()
    )
    items = [S.ticket_row(t) for t in rows]

    # SLA is derived, so it has to be filtered after serialization.
    if sla_state:
        items = [i for i in items if i["sla_state"] == sla_state]

    return {"items": items, "total": total, "page": page, "page_size": page_size}


@router.post("", status_code=201)
def create_ticket(
    data: schemas.TicketCreate,
    user: User = Depends(current_user),
    db: Session = Depends(get_db),
):
    category = db.get(Category, data.category_id)
    if not category or not category.active:
        raise HTTPException(400, "קטגוריה לא חוקית")

    request_type = None
    if data.request_type_id:
        allowed = {rt.id for rt in category.request_types}
        if allowed and data.request_type_id not in allowed:
            raise HTTPException(400, "סוג הבקשה אינו זמין בקטגוריה זו")
        request_type = next(
            (rt for rt in category.request_types if rt.id == data.request_type_id), None)

    priority = data.priority or category.default_priority
    if priority not in Priority.ALL:
        raise HTTPException(400, "דחיפות לא חוקית")

    now = datetime.now(timezone.utc)
    ticket = Ticket(
        number="TMP",
        subject=data.subject.strip(),
        description=data.description.strip(),
        category_id=category.id,
        request_type_id=request_type.id if request_type else None,
        requester_id=user.id,
        resolver_id=category.resolver_id,
        priority=priority,
        status=TicketStatus.ASSIGNED if category.resolver_id else TicketStatus.NEW,
        estimated_cost=data.estimated_cost,
        estimated_hours=data.estimated_hours,
        sla_due_at=sla.due_at(category, now),
    )
    db.add(ticket)
    db.flush()
    ticket.number = _next_number(db, ticket.id)

    audit.record(db, action="ticket_created", actor=user, ticket_id=ticket.id,
                 details={"category": category.name, "priority": priority})

    if category.resolver_id:
        db.add(TicketAssignment(
            ticket_id=ticket.id, to_user_id=category.resolver_id,
            to_category_id=category.id, actor_id=user.id, reason="הקצאה אוטומטית לפי קטגוריה"))
        audit.system(db, action="ticket_assigned", ticket_id=ticket.id,
                     details={"to": category.resolver.full_name if category.resolver else ""})

    created = approval_service.apply(db, ticket, category, requested_by_id=user.id)
    for approval in created:
        audit.system(db, action="approval_requested", ticket_id=ticket.id,
                     details={"reason": approval.reason})

    db.flush()
    # The requester gets their own message, not a copy of the desk's. It leads
    # with the ticket number, which is what they will quote when they follow up.
    notifications.emit(
        db, Events.TICKET_CONFIRMED,
        recipients=[Recipient.from_user(user)],
        ticket=ticket, context={"priority": priority})
    notifications.emit(
        db, Events.TICKET_CREATED,
        recipients=[Recipient.from_user(category.resolver)],
        ticket=ticket)
    if category.resolver:
        notifications.emit(
            db, Events.TICKET_ASSIGNED,
            recipients=[Recipient.from_user(category.resolver)],
            ticket=ticket, context={"priority": priority})
    for approval in created:
        notifications.emit(
            db, Events.APPROVAL_REQUESTED,
            recipients=[Recipient.from_user(approval.approver)],
            ticket=ticket, context={"reason": approval.reason})

    db.commit()
    db.refresh(ticket)
    return S.ticket_detail(ticket, viewer=user)


@router.get("/{ticket_id}")
def get_ticket(
    ticket_id: int,
    user: User = Depends(current_user),
    db: Session = Depends(get_db),
):
    ticket = visible_ticket(ticket_id, user, db)

    # First open by the assigned resolver moves ASSIGNED -> VIEWED.
    if (ticket.resolver_id == user.id
            and ticket.status == TicketStatus.ASSIGNED):
        ticket.status = TicketStatus.VIEWED
        ticket.first_viewed_at = datetime.now(timezone.utc)
        audit.record(db, action="ticket_viewed", actor=user, ticket_id=ticket.id)
        db.commit()
        db.refresh(ticket)

    return S.ticket_detail(ticket, viewer=user)


@router.get("/{ticket_id}/activity")
def ticket_activity(
    ticket_id: int,
    user: User = Depends(current_user),
    db: Session = Depends(get_db),
):
    """Merged conversation and system timeline, newest last."""
    ticket = visible_ticket(ticket_id, user, db)
    include_internal = user.role != Role.REQUESTER

    comments = db.query(TicketComment).filter(
        TicketComment.ticket_id == ticket.id).order_by(TicketComment.id).all()
    events = db.query(AuditEvent).filter(
        AuditEvent.ticket_id == ticket.id).order_by(AuditEvent.id).all()

    items = [c for c in (S.comment(row, include_internal=include_internal) for row in comments) if c]
    items += [S.audit_event(e) for e in events]
    items.sort(key=lambda i: (i["created_at"] or "", i["id"]))
    return {"items": items}


@router.get("/{ticket_id}/attachments")
def ticket_attachments(
    ticket_id: int,
    user: User = Depends(current_user),
    db: Session = Depends(get_db),
):
    ticket = visible_ticket(ticket_id, user, db)
    rows = db.query(TicketAttachment).filter(
        TicketAttachment.ticket_id == ticket.id).order_by(TicketAttachment.id.desc()).all()
    return {"items": [S.attachment(r) for r in rows]}


@router.post("/{ticket_id}/attachments", status_code=201)
def upload_attachment(
    ticket_id: int,
    file: UploadFile = File(...),
    user: User = Depends(current_user),
    db: Session = Depends(get_db),
):
    ticket = visible_ticket(ticket_id, user, db)
    stored = files.store(file, subdir=f"tickets/{ticket.id}")
    row = TicketAttachment(
        ticket_id=ticket.id, uploaded_by_id=user.id, uploaded_by_name=user.full_name, **stored)
    db.add(row)
    audit.record(db, action="attachment_added", actor=user, ticket_id=ticket.id,
                 details={"filename": stored["filename"]})
    db.commit()
    db.refresh(row)
    return S.attachment(row)


@router.post("/{ticket_id}/comments", status_code=201)
def add_comment(
    ticket_id: int,
    data: schemas.CommentIn,
    user: User = Depends(current_user),
    db: Session = Depends(get_db),
):
    ticket = visible_ticket(ticket_id, user, db)
    # A requester can never post an internal note, whatever the payload says.
    internal = bool(data.internal) and user.role != Role.REQUESTER

    db.add(TicketComment(
        ticket_id=ticket.id, author_id=user.id, author_name=user.full_name,
        body=data.body.strip(), internal=internal))
    audit.record(db, action="comment_added", actor=user, ticket_id=ticket.id,
                 details={"internal": internal})

    if not internal:
        # Notify the other side of the conversation.
        targets = []
        if user.id != ticket.requester_id:
            targets.append(Recipient.from_user(ticket.requester))
        if ticket.resolver and user.id != ticket.resolver_id:
            targets.append(Recipient.from_user(ticket.resolver))
        if targets:
            notifications.emit(db, Events.COMMENT_ADDED, recipients=targets,
                               ticket=ticket, context={"body": data.body.strip()[:400]})
    db.commit()
    return {"ok": True}


@router.patch("/{ticket_id}")
def update_ticket(
    ticket_id: int,
    data: schemas.TicketUpdate,
    user: User = Depends(require_staff),
    db: Session = Depends(get_db),
):
    ticket = visible_ticket(ticket_id, user, db)
    assert_can_work(ticket, user)

    changes = data.model_dump(exclude_none=True)
    if "priority" in changes and changes["priority"] not in Priority.ALL:
        raise HTTPException(400, "דחיפות לא חוקית")
    for field, value in changes.items():
        setattr(ticket, field, value)

    if ticket.status in (TicketStatus.ASSIGNED, TicketStatus.VIEWED, TicketStatus.NEW):
        ticket.status = TicketStatus.IN_PROGRESS

    # Estimates changing may trip an approval rule that did not fire before.
    if "estimated_cost" in changes or "estimated_hours" in changes:
        created = approval_service.apply(db, ticket, ticket.category, requested_by_id=user.id)
        for approval in created:
            audit.system(db, action="approval_requested", ticket_id=ticket.id,
                         details={"reason": approval.reason})
            notifications.emit(db, Events.APPROVAL_REQUESTED,
                               recipients=[Recipient.from_user(approval.approver)],
                               ticket=ticket, context={"reason": approval.reason})

    audit.record(db, action="ticket_updated", actor=user, ticket_id=ticket.id, details=changes)
    db.commit()
    db.refresh(ticket)
    return S.ticket_detail(ticket, viewer=user)


@router.post("/{ticket_id}/start")
def start_work(
    ticket_id: int,
    user: User = Depends(require_staff),
    db: Session = Depends(get_db),
):
    ticket = visible_ticket(ticket_id, user, db)
    assert_can_work(ticket, user)
    if ticket.status in TicketStatus.CLOSED:
        raise HTTPException(400, "הקריאה סגורה")
    ticket.status = TicketStatus.IN_PROGRESS
    audit.record(db, action="ticket_in_progress", actor=user, ticket_id=ticket.id)
    db.commit()
    db.refresh(ticket)
    return S.ticket_detail(ticket, viewer=user)


@router.post("/{ticket_id}/transfer")
def transfer(
    ticket_id: int,
    data: schemas.TransferIn,
    user: User = Depends(require_staff),
    db: Session = Depends(get_db),
):
    """Hand a ticket to another resolver, optionally in another category.

    Everything already attached to the ticket stays attached; only the
    assignment changes, and it is recorded on both the assignment log and the
    audit trail.
    """
    ticket = visible_ticket(ticket_id, user, db)
    assert_can_work(ticket, user)

    new_resolver = db.get(User, data.resolver_id)
    if not new_resolver or not new_resolver.active or new_resolver.role not in (
            Role.RESOLVER, Role.ADMIN):
        raise HTTPException(400, "המטפל שנבחר אינו זמין")

    previous_resolver = ticket.resolver
    previous_category = ticket.category
    new_category = previous_category

    if data.category_id and data.category_id != ticket.category_id:
        new_category = db.get(Category, data.category_id)
        if not new_category or not new_category.active:
            raise HTTPException(400, "קטגוריה לא חוקית")
        ticket.category_id = new_category.id
        # Re-base the SLA clock on the receiving category's target.
        ticket.sla_due_at = sla.due_at(new_category, ticket.created_at)

    ticket.resolver_id = new_resolver.id
    # Back to ASSIGNED so the receiving resolver produces their own view event.
    ticket.status = TicketStatus.ASSIGNED

    db.add(TicketAssignment(
        ticket_id=ticket.id,
        from_user_id=previous_resolver.id if previous_resolver else None,
        to_user_id=new_resolver.id,
        from_category_id=previous_category.id if previous_category else None,
        to_category_id=new_category.id if new_category else None,
        reason=data.reason,
        actor_id=user.id,
    ))
    audit.record(db, action="ticket_transferred", actor=user, ticket_id=ticket.id, details={
        "from": previous_resolver.full_name if previous_resolver else "—",
        "to": new_resolver.full_name,
        "from_category": previous_category.name if previous_category else None,
        "to_category": new_category.name if new_category else None,
        "reason": data.reason,
    })
    db.flush()
    notifications.emit(db, Events.TICKET_TRANSFERRED,
                       recipients=[Recipient.from_user(new_resolver)],
                       ticket=ticket, context={"reason": data.reason})
    db.commit()
    db.refresh(ticket)
    return S.ticket_detail(ticket, viewer=user)


@router.post("/{ticket_id}/resolve")
def resolve_ticket(
    ticket_id: int,
    data: schemas.TicketResolve,
    user: User = Depends(require_staff),
    db: Session = Depends(get_db),
):
    ticket = visible_ticket(ticket_id, user, db)
    assert_can_work(ticket, user)
    if ticket.approval_state == TicketApprovalState.PENDING:
        raise HTTPException(400, "לא ניתן לסגור קריאה הממתינה לאישור")

    open_subtasks = db.query(Subtask).filter(
        Subtask.ticket_id == ticket.id,
        Subtask.status.in_(["open", "in_progress"]),
    ).count()
    if open_subtasks:
        raise HTTPException(400, f"קיימות {open_subtasks} משימות משנה פתוחות")

    ticket.status = TicketStatus.RESOLVED
    ticket.resolved_at = datetime.now(timezone.utc)
    ticket.resolution_note = data.note.strip()
    audit.record(db, action="ticket_resolved", actor=user, ticket_id=ticket.id,
                 details={"note": data.note.strip()[:400]})
    db.flush()
    notifications.emit(db, Events.TICKET_RESOLVED,
                       recipients=[Recipient.from_user(ticket.requester)],
                       ticket=ticket, context={"note": data.note.strip()[:400]})
    db.commit()
    db.refresh(ticket)
    return S.ticket_detail(ticket, viewer=user)


@router.post("/{ticket_id}/reject")
def reject_ticket(
    ticket_id: int,
    data: schemas.TicketReject,
    user: User = Depends(require_staff),
    db: Session = Depends(get_db),
):
    ticket = visible_ticket(ticket_id, user, db)
    assert_can_work(ticket, user)
    ticket.status = TicketStatus.REJECTED
    ticket.resolved_at = datetime.now(timezone.utc)
    ticket.resolution_note = data.note.strip()
    audit.record(db, action="ticket_rejected", actor=user, ticket_id=ticket.id,
                 details={"note": data.note.strip()[:400]})
    db.flush()
    notifications.emit(db, Events.TICKET_REJECTED,
                       recipients=[Recipient.from_user(ticket.requester)],
                       ticket=ticket, context={"note": data.note.strip()[:400]})
    db.commit()
    db.refresh(ticket)
    return S.ticket_detail(ticket, viewer=user)


@router.post("/{ticket_id}/reopen")
def reopen_ticket(
    ticket_id: int,
    data: schemas.TicketReopen,
    user: User = Depends(current_user),
    db: Session = Depends(get_db),
):
    """Requester reopens a closed ticket.

    The same ticket returns to active work: no new record is created, and every
    comment, file, approval, subtask and history entry stays exactly where it
    was.
    """
    ticket = visible_ticket(ticket_id, user, db)
    if ticket.requester_id != user.id and user.role != Role.ADMIN:
        raise HTTPException(403, "רק פותח הקריאה יכול לפתוח אותה מחדש")
    if ticket.status not in TicketStatus.CLOSED:
        raise HTTPException(400, "הקריאה אינה סגורה")

    ticket.status = TicketStatus.REOPENED
    ticket.resolved_at = None
    ticket.reopen_count += 1
    audit.record(db, action="ticket_reopened", actor=user, ticket_id=ticket.id,
                 details={"reason": data.reason.strip()[:400], "count": ticket.reopen_count})
    db.flush()
    notifications.emit(db, Events.TICKET_REOPENED,
                       recipients=[Recipient.from_user(ticket.resolver)],
                       ticket=ticket, context={"reason": data.reason.strip()[:400]})
    db.commit()
    db.refresh(ticket)
    return S.ticket_detail(ticket, viewer=user)
