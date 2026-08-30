"""Upload handling. Validates before anything touches disk, and never trusts
the client-supplied filename for storage."""
import secrets
from pathlib import Path

from fastapi import HTTPException, UploadFile

from ..config import ALLOWED_UPLOAD_EXTENSIONS, ALLOWED_UPLOAD_TYPES, MAX_UPLOAD_BYTES, MAX_UPLOAD_MB, UPLOAD_DIR

CHUNK = 1024 * 1024


def _safe_extension(filename: str) -> str:
    ext = Path(filename or "").suffix.lower()
    if ext not in ALLOWED_UPLOAD_EXTENSIONS:
        raise HTTPException(400, f"סוג הקובץ {ext or 'לא ידוע'} אינו נתמך")
    return ext


def store(upload: UploadFile, *, subdir: str = "") -> dict:
    """Validate and persist one upload. Returns the attachment fields.

    Size is enforced while streaming rather than by trusting a header, and the
    stored name is random so a crafted filename cannot escape the directory or
    collide with an existing file.
    """
    original = Path(upload.filename or "file").name
    ext = _safe_extension(original)

    content_type = (upload.content_type or "application/octet-stream").split(";")[0].strip()
    if content_type not in ALLOWED_UPLOAD_TYPES:
        raise HTTPException(400, f"סוג התוכן {content_type} אינו נתמך")

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
