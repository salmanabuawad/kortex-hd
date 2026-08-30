"""External guest workspace.

Unauthenticated by design: the bearer of a valid token acts as the external
assignee of exactly one subtask. Every route here is rate limited, resolves the
token by digest, and returns the deliberately narrow guest projection.

An invalid, revoked, expired token and a finished subtask all produce the same
410 with the same message, so the endpoint cannot be used to probe for which
subtasks exist.
"""
from datetime import datetime, timezone

from fastapi import APIRouter, Depends, File, HTTPException, UploadFile
from sqlalchemy.orm import Session

from .. import schemas
from ..constants import Events, SubtaskStatus
from ..db import get_db
from ..models import SubtaskAttachment, SubtaskComment, Ticket
from ..services import audit, files, notifications, tokens
from ..services.notifications import Recipient
from .deps import guest_rate_limit
from . import serializers as S

router = APIRouter(prefix="/api/external", tags=["external"])

GONE = "הקישור אינו פעיל עוד. המשימה הושלמה או נסגרה."


def _resolve(db: Session, token: str):
    found = tokens.resolve(db, token)
    if not found:
        raise HTTPException(410, GONE)
    return found


@router.get("/subtask/{token}")
def guest_view(
    token: str,
    db: Session = Depends(get_db),
    _: None = Depends(guest_rate_limit),
):
    _, subtask = _resolve(db, token)
    ticket = db.get(Ticket, subtask.ticket_id)

    comments = (
        db.query(SubtaskComment)
        .filter(SubtaskComment.subtask_id == subtask.id, SubtaskComment.internal.is_(False))
        .order_by(SubtaskComment.id)
        .all()
    )
    attachments = (
        db.query(SubtaskAttachment)
        .filter(
            SubtaskAttachment.subtask_id == subtask.id,
            SubtaskAttachment.shared_with_external.is_(True),
        )
        .order_by(SubtaskAttachment.id)
        .all()
    )
    db.commit()                                   # persists last_used_at
    return S.guest_subtask(subtask, ticket, comments, attachments)


@router.patch("/subtask/{token}")
def guest_update(
    token: str,
    data: schemas.GuestUpdate,
    db: Session = Depends(get_db),
    _: None = Depends(guest_rate_limit),
):
    _, subtask = _resolve(db, token)
    actor = subtask.external_name or "גורם חיצוני"
    now = datetime.now(timezone.utc)

    if not data.comment and not data.status:
        raise HTTPException(400, "לא נשלח עדכון")

    if data.comment:
        db.add(SubtaskComment(
            subtask_id=subtask.id, author_name=actor, author_kind="external",
            body=data.comment.strip(), internal=False))
        audit.external(db, action="external_comment_added", actor_name=actor,
                       ticket_id=subtask.ticket_id, subtask_id=subtask.id)

    if data.status:
        # A guest may progress or finish their own task, nothing else.
        if data.status not in (SubtaskStatus.OPEN, SubtaskStatus.IN_PROGRESS,
                               SubtaskStatus.RESOLVED):
            raise HTTPException(400, "סטטוס לא חוקי")
        previous = subtask.status
        subtask.status = data.status
        audit.external(db, action="external_status_changed", actor_name=actor,
                       ticket_id=subtask.ticket_id, subtask_id=subtask.id,
                       details={"from": previous, "to": data.status})
        if data.status == SubtaskStatus.RESOLVED:
            subtask.resolved_at = now
            # The link dies with the task it was issued for.
            tokens.revoke_all(db, subtask.id, reason="completed")
            audit.system(db, action="external_link_deactivated",
                         ticket_id=subtask.ticket_id, subtask_id=subtask.id)

    subtask.last_external_activity_at = now

    ticket = db.get(Ticket, subtask.ticket_id)
    notifications.emit(
        db, Events.SUBTASK_UPDATED,
        recipients=[Recipient.from_user(ticket.resolver)] if ticket else [],
        ticket=ticket, subtask=subtask,
        context={"status": subtask.status, "body": (data.comment or "")[:300]})

    db.commit()
    still_active = subtask.status in SubtaskStatus.ACTIVE
    return {"ok": True, "status": subtask.status, "link_active": still_active}


@router.post("/subtask/{token}/attachments", status_code=201)
def guest_upload(
    token: str,
    file: UploadFile = File(...),
    db: Session = Depends(get_db),
    _: None = Depends(guest_rate_limit),
):
    _, subtask = _resolve(db, token)
    actor = subtask.external_name or "גורם חיצוני"
    stored = files.store(file, subdir=f"subtasks/{subtask.id}")
    row = SubtaskAttachment(
        subtask_id=subtask.id, uploaded_by=actor, shared_with_external=True, **stored)
    db.add(row)
    subtask.last_external_activity_at = datetime.now(timezone.utc)
    audit.external(db, action="external_attachment_uploaded", actor_name=actor,
                   ticket_id=subtask.ticket_id, subtask_id=subtask.id,
                   details={"filename": stored["filename"]})
    db.commit()
    db.refresh(row)
    return {
        "id": row.id, "filename": row.filename,
        "size_bytes": row.size_bytes, "content_type": row.content_type,
    }


@router.get("/subtask/{token}/attachments/{attachment_id}")
def guest_download(
    token: str,
    attachment_id: int,
    db: Session = Depends(get_db),
    _: None = Depends(guest_rate_limit),
):
    from fastapi.responses import FileResponse

    _, subtask = _resolve(db, token)
    row = db.get(SubtaskAttachment, attachment_id)
    # The attachment must belong to this subtask and be flagged as shared.
    if not row or row.subtask_id != subtask.id or not row.shared_with_external:
        raise HTTPException(404, "הקובץ לא נמצא")
    db.commit()
    return FileResponse(
        files.path_for(row.stored_name), filename=row.filename, media_type=row.content_type)
