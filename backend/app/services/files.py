"""Upload handling. Validates before anything touches disk, and never trusts
the client-supplied filename for storage."""
import secrets
from pathlib import Path

from fastapi import HTTPException, UploadFile

from ..config import (
    ALLOWED_UPLOAD_EXTENSIONS, ALLOWED_UPLOAD_TYPES, EXTENSION_CONTENT_TYPES,
    GENERIC_UPLOAD_TYPES, MAX_UPLOAD_BYTES, MAX_UPLOAD_MB, UPLOAD_DIR, WEBM_CONTENT_TYPES,
)

CHUNK = 1024 * 1024


def _safe_extension(filename: str) -> str:
    ext = Path(filename or "").suffix.lower()
    if ext not in ALLOWED_UPLOAD_EXTENSIONS:
        raise HTTPException(400, f"סוג הקובץ {ext or 'לא ידוע'} אינו נתמך")
    return ext


def _resolve_type(ext: str, declared: str | None) -> str:
    """Decide what this file actually is.

    The extension has already been checked against the allow-list, so it is the
    trustworthy half and the stored type is derived from it. The client's header
    is only used to reject a positively wrong claim, and to break the .webm tie
    between audio and video.

    Browsers send application/octet-stream for a .docx or .pdf often enough --
    Windows with no Office association, some drag-and-drop paths, files off a
    share -- that treating it as a refusal blocked ordinary documents.
    """
    header = (declared or "").split(";")[0].strip().lower()
    if header and header not in ALLOWED_UPLOAD_TYPES and header not in GENERIC_UPLOAD_TYPES:
        raise HTTPException(400, f"סוג התוכן {header} אינו נתמך")
    if ext == ".webm":
        return WEBM_CONTENT_TYPES.get(header, "video/webm")
    return EXTENSION_CONTENT_TYPES[ext]


def store(upload: UploadFile, *, subdir: str = "") -> dict:
    """Validate and persist one upload. Returns the attachment fields.

    Size is enforced while streaming rather than by trusting a header, and the
    stored name is random so a crafted filename cannot escape the directory or
    collide with an existing file.
    """
    original = Path(upload.filename or "file").name
    ext = _safe_extension(original)
    content_type = _resolve_type(ext, upload.content_type)

    target_dir = UPLOAD_DIR / subdir if subdir else UPLOAD_DIR
    target_dir.mkdir(parents=True, exist_ok=True)
    stored_name = f"{secrets.token_hex(16)}{ext}"
    target = target_dir / stored_name

    size = 0
    try:
        with target.open("wb") as out:
            while chunk := upload.file.read(CHUNK):
                size += len(chunk)
                if size > MAX_UPLOAD_BYTES:
                    out.close()
                    target.unlink(missing_ok=True)
                    raise HTTPException(400, f"הקובץ גדול מהמותר ({MAX_UPLOAD_MB} מגהבייט)")
                out.write(chunk)
    except HTTPException:
        raise
    except OSError as exc:
        target.unlink(missing_ok=True)
        raise HTTPException(500, "שמירת הקובץ נכשלה") from exc

    if size == 0:
        target.unlink(missing_ok=True)
        raise HTTPException(400, "הקובץ ריק")

    return {
        "filename": original,
        "stored_name": str(Path(subdir) / stored_name) if subdir else stored_name,
        "content_type": content_type,
        "size_bytes": size,
    }


def path_for(stored_name: str) -> Path:
    """Resolve a stored name back to a path, refusing anything that escapes
    the upload root."""
    root = UPLOAD_DIR.resolve()
    candidate = (root / stored_name).resolve()
    if not str(candidate).startswith(str(root)):
        raise HTTPException(400, "נתיב קובץ לא חוקי")
    if not candidate.is_file():
        raise HTTPException(404, "הקובץ לא נמצא")
    return candidate
