"""Runtime configuration. Values come from the environment (see .env.example)."""
import os
from pathlib import Path

from dotenv import load_dotenv

load_dotenv(Path(__file__).resolve().parent.parent / ".env")

ENV = os.getenv("ENV", "development")
IS_PRODUCTION = ENV == "production"

# PostgreSQL is the only supported database.
DATABASE_URL = os.getenv(
    "DATABASE_URL",
    "postgresql+psycopg2://municipos:municipos@localhost:5433/municipos",
)

JWT_SECRET = os.getenv("JWT_SECRET", "" if IS_PRODUCTION else "dev-secret-change-me")
TOKEN_TTL_HOURS = int(os.getenv("TOKEN_TTL_HOURS", "12"))

FRONTEND_URL = os.getenv("FRONTEND_URL", "http://localhost:5173")
PUBLIC_BASE_URL = os.getenv("PUBLIC_BASE_URL", FRONTEND_URL)

UPLOAD_DIR = Path(os.getenv("UPLOAD_DIR", "uploads"))
# A phone video of a fault runs to tens of megabytes, so the ceiling sits well
# above the old document-only limit. nginx allows 64m on this vhost; staying
# under it means an oversized upload is refused by us, with a Hebrew message,
# rather than cut off by nginx with an opaque 413.
MAX_UPLOAD_MB = int(os.getenv("MAX_UPLOAD_MB", "50"))
MAX_UPLOAD_BYTES = MAX_UPLOAD_MB * 1024 * 1024

# Deliberately conservative: council staff exchange documents, photographs and
# recordings of a fault, not archives or executables.
ALLOWED_UPLOAD_TYPES = {
    "image/jpeg", "image/png", "image/gif", "image/webp", "image/heic",
    "application/pdf",
    "text/plain", "text/csv",
    "application/msword",
    "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    "application/vnd.ms-excel",
    "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    # Video: what phone cameras actually hand over. iPhone records QuickTime,
    # Android mp4 or 3gpp, and a desktop screen capture arrives as webm.
    "video/mp4", "video/quicktime", "video/webm", "video/3gpp",
    # Audio: MediaRecorder emits webm on Chrome and Firefox and mp4 on Safari,
    # so a voice note recorded in the browser is one of those two. The rest
    # cover a file picked from disk or sent from a phone.
    "audio/webm", "audio/mp4", "audio/mpeg", "audio/ogg", "audio/wav",
    "audio/x-wav", "audio/aac", "audio/x-m4a", "audio/3gpp",
}
ALLOWED_UPLOAD_EXTENSIONS = {
    ".jpg", ".jpeg", ".png", ".gif", ".webp", ".heic",
    ".pdf", ".txt", ".csv", ".doc", ".docx", ".xls", ".xlsx",
    ".mp4", ".mov", ".webm", ".3gp",
    ".m4a", ".mp3", ".ogg", ".oga", ".wav", ".aac",
}

# Types safe to hand back with an inline disposition so the browser can play
# or show them in place. Everything else stays a download.
INLINE_PREVIEW_PREFIXES = ("image/", "video/", "audio/")

# What a browser sends when it has no idea what the file is: Windows without
# Office registered for .docx, several drag-and-drop paths, files off a network
# share. Refusing these rejected perfectly ordinary PDFs and Word documents, so
# they are tolerated and the extension decides instead.
GENERIC_UPLOAD_TYPES = {
    "", "application/octet-stream", "binary/octet-stream",
    "application/zip", "application/x-zip-compressed",
}

# The extension is validated against ALLOWED_UPLOAD_EXTENSIONS before this is
# consulted, so it -- not the client's header -- is what the stored type is
# derived from. A header cannot then talk a .pdf into being previewed as video.
EXTENSION_CONTENT_TYPES = {
    ".jpg": "image/jpeg", ".jpeg": "image/jpeg", ".png": "image/png",
    ".gif": "image/gif", ".webp": "image/webp", ".heic": "image/heic",
    ".pdf": "application/pdf", ".txt": "text/plain", ".csv": "text/csv",
    ".doc": "application/msword",
    ".docx": "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    ".xls": "application/vnd.ms-excel",
    ".xlsx": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    ".mp4": "video/mp4", ".mov": "video/quicktime", ".3gp": "video/3gpp",
    ".m4a": "audio/mp4", ".mp3": "audio/mpeg", ".ogg": "audio/ogg",
    ".oga": "audio/ogg", ".wav": "audio/wav", ".aac": "audio/aac",
}
# .webm carries either, so the declared type breaks the tie.
WEBM_CONTENT_TYPES = {"audio/webm": "audio/webm", "video/webm": "video/webm"}

# Rate limits: (requests, window seconds)
LOGIN_RATE_LIMIT = (int(os.getenv("LOGIN_RATE_LIMIT", "8")), 300)
GUEST_RATE_LIMIT = (int(os.getenv("GUEST_RATE_LIMIT", "60")), 300)

# Notification providers. "log" records the delivery without calling anyone,
# which is the correct default until real provider credentials exist.
EMAIL_PROVIDER = os.getenv("EMAIL_PROVIDER", "log")
SMS_PROVIDER = os.getenv("SMS_PROVIDER", "log")
WHATSAPP_PROVIDER = os.getenv("WHATSAPP_PROVIDER", "log")

SMTP_HOST = os.getenv("SMTP_HOST", "")
SMTP_PORT = int(os.getenv("SMTP_PORT", "587"))
SMTP_USER = os.getenv("SMTP_USER", "")
SMTP_PASSWORD = os.getenv("SMTP_PASSWORD", "")
SMTP_FROM = os.getenv("SMTP_FROM", "helpdesk@buqata.muni.il")

COUNCIL_NAME = os.getenv("COUNCIL_NAME", "מועצה מקומית בוקעאתא")

if not DATABASE_URL.startswith("postgresql"):
    raise RuntimeError(
        f"DATABASE_URL must be a postgresql:// URL, got {DATABASE_URL.split('://')[0]!r}"
    )

if IS_PRODUCTION and not JWT_SECRET:
    raise RuntimeError("JWT_SECRET must be set when ENV=production")
