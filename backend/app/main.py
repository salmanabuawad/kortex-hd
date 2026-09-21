"""Application entrypoint.

Schema creation and seeding are deploy steps (`alembic upgrade head`,
`python -m app.seed`), never import side effects, so starting N uvicorn workers
does N times nothing to the database.
"""
import logging

from fastapi import APIRouter, Depends, FastAPI, HTTPException, Request
from fastapi.exceptions import RequestValidationError
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse, JSONResponse
from sqlalchemy.exc import SQLAlchemyError
from sqlalchemy.orm import Session

from .api import admin, approvals, auth, display, external, insights, subtasks, tickets
from .api.deps import current_user, visible_ticket
from .config import COUNCIL_NAME, FRONTEND_URL, INLINE_PREVIEW_PREFIXES, UPLOAD_DIR
from .db import get_db
from .models import Subtask, SubtaskAttachment, TicketAttachment
from .services import files

logging.basicConfig(
    level=logging.INFO, format="%(asctime)s %(levelname)s %(name)s: %(message)s")
log = logging.getLogger("helpdesk")

app = FastAPI(
    title="Kortex Support — מוקד שירות",
    description=f"מערכת מוקד שירות עבור {COUNCIL_NAME}",
    version="2.0.0",
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=[FRONTEND_URL],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

UPLOAD_DIR.mkdir(parents=True, exist_ok=True)

attachments = APIRouter(prefix="/api/attachments", tags=["attachments"])


def _serve(row, *, inline: bool) -> FileResponse:
    """One file, either as a download or in place.

    Passing `filename` makes Starlette send Content-Disposition: attachment,
    which is what we want for a document but not for a photograph or a voice
    note the reader wants to see and hear without leaving the ticket. Only
    media is ever served inline, so a .csv cannot be coaxed into rendering in
    the page. FileResponse answers Range requests either way, so seeking
    within a video does not refetch the whole file.
    """
    can_inline = inline and row.content_type.startswith(INLINE_PREVIEW_PREFIXES)
    return FileResponse(
        files.path_for(row.stored_name),
        media_type=row.content_type,
        filename=None if can_inline else row.filename,
    )


@attachments.get("/ticket/{attachment_id}")
def download_ticket_attachment(
    attachment_id: int,
    inline: bool = False,
    user=Depends(current_user),
    db: Session = Depends(get_db),
):
    row = db.get(TicketAttachment, attachment_id)
    if not row:
        raise HTTPException(404, "הקובץ לא נמצא")
    visible_ticket(row.ticket_id, user, db)          # authorization via parent ticket
    return _serve(row, inline=inline)


@attachments.get("/subtask/{attachment_id}")
def download_subtask_attachment(
    attachment_id: int,
    inline: bool = False,
    user=Depends(current_user),
    db: Session = Depends(get_db),
):
    row = db.get(SubtaskAttachment, attachment_id)
    if not row:
        raise HTTPException(404, "הקובץ לא נמצא")
    subtask = db.get(Subtask, row.subtask_id)
    if not subtask:
        raise HTTPException(404, "הקובץ לא נמצא")
    visible_ticket(subtask.ticket_id, user, db)
    return _serve(row, inline=inline)


for module in (auth, tickets, subtasks, external, approvals, admin, insights, display):
    app.include_router(module.router)
app.include_router(attachments)


@app.exception_handler(RequestValidationError)
def validation_error(request: Request, exc: RequestValidationError):
    """Surface the first field problem in a shape the frontend can display."""
    first = exc.errors()[0] if exc.errors() else {}
    field = ".".join(str(p) for p in first.get("loc", []) if p != "body")
    detail = f"{field}: {first.get('msg', 'ערך לא חוקי')}" if field else "הנתונים אינם תקינים"
    return JSONResponse(status_code=422, content={"detail": detail})


@app.exception_handler(SQLAlchemyError)
def database_error(request: Request, exc: SQLAlchemyError):
    # Log the detail, return a generic message: driver errors leak schema.
    log.exception("database error on %s %s", request.method, request.url.path)
    return JSONResponse(status_code=500, content={"detail": "אירעה שגיאה במסד הנתונים"})
