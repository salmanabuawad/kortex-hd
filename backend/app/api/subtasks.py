"""Subtasks under a parent ticket, internal or external."""
from datetime import datetime, timezone

from fastapi import APIRouter, Depends, File, HTTPException, UploadFile
from sqlalchemy.orm import Session

from .. import schemas
from ..constants import AssigneeType, Channel, Events, Priority, Role, SubtaskStatus, TicketStatus
from ..db import get_db
from ..models import Subtask, SubtaskAttachment, SubtaskComment, User
from ..services import audit, files, notifications, tokens
from ..services.notifications import Recipient
from .deps import assert_can_work, current_user, require_staff, visible_ticket
from . import serializers as S

router = APIRouter(prefix="/api", tags=["subtasks"])


def _number(ticket_number: str, seq: int) -> str:
    return f"{ticket_number}-{seq:02d}"


def _load(db: Session, subtask_id: int, user: User) -> Subtask:
    subtask = db.get(Subtask, subtask_id)
    if not subtask:
        raise HTTPException(404, "המשימה לא נמצאה")
    visible_ticket(subtask.ticket_id, user, db)      # reuses ticket-level authorization
    return subtask


@router.get("/tickets/{ticket_id}/subtasks")
def list_subtasks(
    ticket_id: int,
    user: User = Depends(current_user),
    db: Session = Depends(get_db),
):
    ticket = visible_ticket(ticket_id, user, db)
    rows = db.query(Subtask).filter(
        Subtask.ticket_id == ticket.id).order_by(Subtask.id).all()
    staff = user.role in Role.STAFF
    return {"items": [
        S.subtask(r, token_state=tokens.status_for(db, r.id) if staff else None) for r in rows]}


@router.post("/tickets/{ticket_id}/subtasks", status_code=201)
def create_subtask(
    ticket_id: int,
    data: schemas.SubtaskCreate,
    user: User = Depends(require_staff),
    db: Session = Depends(get_db),
):
    ticket = visible_ticket(ticket_id, user, db)
    assert_can_work(ticket, user)

    if data.assignee_type not in (AssigneeType.INTERNAL, AssigneeType.EXTERNAL):
        raise HTTPException(400, "סוג אחראי לא חוקי")
    if data.priority not in Priority.ALL:
        raise HTTPException(400, "דחיפות לא חוקית")

    assignee = None
    if data.assignee_type == AssigneeType.INTERNAL:
        if not data.assignee_user_id:
            raise HTTPException(400, "יש לבחור אחראי פנימי")
        assignee = db.get(User, data.assignee_user_id)
        if not assignee or not assignee.active:
            raise HTTPException(400, "האחראי שנבחר אינו זמין")
    else:
        if not data.external_name:
            raise HTTPException(400, "יש להזין שם איש קשר חיצוני")
        if not (data.external_email or data.external_phone):
            raise HTTPException(400, "יש להזין דוא״ל או טלפון ליצירת קשר")
        if data.external_channel and data.external_channel not in Channel.ALL:
            raise HTTPException(400, "ערוץ מסירה לא חוקי")

    seq = db.query(Subtask).filter(Subtask.ticket_id == ticket.id).count() + 1
    subtask = Subtask(
        number=_number(ticket.number, seq),
        ticket_id=ticket.id,
        title=data.title.strip(),
        description=(data.description or "").strip(),
        assignee_type=data.assignee_type,
        assignee_user_id=assignee.id if assignee else None,
        external_name=data.external_name,
        external_org=data.external_org,
        external_email=str(data.external_email) if data.external_email else None,
        external_phone=data.external_phone,
        external_channel=data.external_channel or (
            Channel.EMAIL if data.external_email else Channel.SMS)
        if data.assignee_type == AssigneeType.EXTERNAL else None,
        due_date=data.due_date,
        priority=data.priority,
        created_by_id=user.id,
    )
    db.add(subtask)
    db.flush()

    if ticket.status not in TicketStatus.CLOSED:
        ticket.status = TicketStatus.IN_PROGRESS

    audit.record(db, action="subtask_created", actor=user, ticket_id=ticket.id,
                 subtask_id=subtask.id,
                 details={"title": subtask.title, "type": subtask.assignee_type})

    guest_link = None
    if subtask.assignee_type == AssigneeType.EXTERNAL:
        _, plaintext = tokens.issue(db, subtask, issued_by_id=user.id)
        guest_link = tokens.link_for(plaintext)
        recipient = Recipient(
            subtask.external_name or "ספק חיצוני",
            email=subtask.external_email,
            phone=subtask.external_phone,
            channel=subtask.external_channel or Channel.EMAIL,
        )
        notifications.emit(db, Events.SUBTASK_LINK_SENT, recipients=[recipient],
                           ticket=ticket, subtask=subtask, context={"link": guest_link})
        audit.record(db, action="external_link_issued", actor=user, ticket_id=ticket.id,
                     subtask_id=subtask.id,
                     details={"channel": subtask.external_channel, "to": recipient.name})
    else:
        notifications.emit(db, Events.SUBTASK_ASSIGNED,
                           recipients=[Recipient.from_user(assignee)],
                           ticket=ticket, subtask=subtask)

    db.commit()
    db.refresh(subtask)
    payload = S.subtask(subtask, token_state=tokens.status_for(db, subtask.id))
    # The plaintext link exists only in this response.
    payload["guest_link"] = guest_link
    return payload


@router.get("/subtasks/{subtask_id}")
def get_subtask(
    subtask_id: int,
    user: User = Depends(current_user),
    db: Session = Depends(get_db),
):
    subtask = _load(db, subtask_id, user)
    staff = user.role in Role.STAFF
    data = S.subtask(subtask, token_state=tokens.status_for(db, subtask.id) if staff else None)
    comments = db.query(SubtaskComment).filter(
        SubtaskComment.subtask_id == subtask.id).order_by(SubtaskComment.id).all()
    if not staff:
        comments = [c for c in comments if not c.internal]
    data["comments"] = [
        {
            "id": c.id, "author": c.author_name, "author_kind": c.author_kind,
            "body": c.body, "internal": c.internal,
            "created_at": c.created_at.isoformat() if c.created_at else None,
        }
        for c in comments
    ]
    attachments = db.query(SubtaskAttachment).filter(
        SubtaskAttachment.subtask_id == subtask.id).order_by(SubtaskAttachment.id).all()
    data["attachments"] = [S.attachment(a) for a in attachments]
    return data


@router.patch("/subtasks/{subtask_id}")
def update_subtask(
    subtask_id: int,
    data: schemas.SubtaskUpdate,
    user: User = Depends(require_staff),
    db: Session = Depends(get_db),
):
    subtask = _load(db, subtask_id, user)
    ticket = subtask.ticket
    assert_can_work(ticket, user)

    if data.status:
        if data.status not in SubtaskStatus.ALL:
            raise HTTPException(400, "סטטוס לא חוקי")
        previous = subtask.status
        subtask.status = data.status
        if data.status in (SubtaskStatus.RESOLVED, SubtaskStatus.CLOSED):
            subtask.resolved_at = datetime.now(timezone.utc)
            revoked = tokens.revoke_all(db, subtask.id, reason="completed")
            if revoked:
                audit.system(db, action="external_link_deactivated",
                             ticket_id=ticket.id, subtask_id=subtask.id)
        audit.record(db, action="subtask_status_changed", actor=user, ticket_id=ticket.id,
                     subtask_id=subtask.id, details={"from": previous, "to": data.status})

    for field in ("title", "description", "due_date", "priority"):
        value = getattr(data, field)
        if value is not None:
            setattr(subtask, field, value)

    db.commit()
    db.refresh(subtask)
    return S.subtask(subtask, token_state=tokens.status_for(db, subtask.id))


@router.post("/subtasks/{subtask_id}/comments", status_code=201)
def add_subtask_comment(
    subtask_id: int,
    data: schemas.CommentIn,
    user: User = Depends(require_staff),
    db: Session = Depends(get_db),
):
    subtask = _load(db, subtask_id, user)
    db.add(SubtaskComment(
        subtask_id=subtask.id, author_user_id=user.id, author_name=user.full_name,
        author_kind="user", body=data.body.strip(), internal=bool(data.internal)))
    audit.record(db, action="subtask_comment_added", actor=user,
                 ticket_id=subtask.ticket_id, subtask_id=subtask.id,
                 details={"internal": bool(data.internal)})
    db.commit()
    return {"ok": True}


@router.post("/subtasks/{subtask_id}/attachments", status_code=201)
def upload_subtask_attachment(
    subtask_id: int,
    file: UploadFile = File(...),
    share_with_external: bool = True,
    user: User = Depends(require_staff),
    db: Session = Depends(get_db),
):
    subtask = _load(db, subtask_id, user)
    stored = files.store(file, subdir=f"subtasks/{subtask.id}")
    row = SubtaskAttachment(
        subtask_id=subtask.id, uploaded_by=user.full_name,
        shared_with_external=share_with_external, **stored)
    db.add(row)
    audit.record(db, action="subtask_attachment_added", actor=user,
                 ticket_id=subtask.ticket_id, subtask_id=subtask.id,
                 details={"filename": stored["filename"], "shared": share_with_external})
    db.commit()
    db.refresh(row)
    return S.attachment(row)


@router.post("/subtasks/{subtask_id}/token/regenerate")
def regenerate_token(
    subtask_id: int,
    user: User = Depends(require_staff),
    db: Session = Depends(get_db),
):
    subtask = _load(db, subtask_id, user)
    assert_can_work(subtask.ticket, user)
    if subtask.assignee_type != AssigneeType.EXTERNAL:
        raise HTTPException(400, "המשימה אינה חיצונית")
    if subtask.status not in SubtaskStatus.ACTIVE:
        raise HTTPException(400, "לא ניתן להנפיק קישור למשימה שהסתיימה")

    _, plaintext = tokens.issue(db, subtask, issued_by_id=user.id)
    link = tokens.link_for(plaintext)
    recipient = Recipient(
        subtask.external_name or "ספק חיצוני",
        email=subtask.external_email, phone=subtask.external_phone,
        channel=subtask.external_channel or Channel.EMAIL)
    notifications.emit(db, Events.SUBTASK_LINK_SENT, recipients=[recipient],
                       ticket=subtask.ticket, subtask=subtask, context={"link": link})
    audit.record(db, action="external_link_regenerated", actor=user,
                 ticket_id=subtask.ticket_id, subtask_id=subtask.id)
    db.commit()
    return {"guest_link": link, "token": tokens.status_for(db, subtask.id)}


@router.post("/subtasks/{subtask_id}/token/revoke")
def revoke_token(
    subtask_id: int,
    user: User = Depends(require_staff),
    db: Session = Depends(get_db),
):
    subtask = _load(db, subtask_id, user)
    assert_can_work(subtask.ticket, user)
    count = tokens.revoke_all(db, subtask.id, reason="revoked")
    audit.record(db, action="external_link_revoked", actor=user,
                 ticket_id=subtask.ticket_id, subtask_id=subtask.id)
    db.commit()
    return {"revoked": count, "token": tokens.status_for(db, subtask.id)}
