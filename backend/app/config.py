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
MAX_UPLOAD_MB = int(os.getenv("MAX_UPLOAD_MB", "20"))
MAX_UPLOAD_BYTES = MAX_UPLOAD_MB * 1024 * 1024

# Deliberately conservative: council staff exchange documents and photographs,
# not archives or executables.
ALLOWED_UPLOAD_TYPES = {
    "image/jpeg", "image/png", "image/gif", "image/webp", "image/heic",
    "application/pdf",
    "text/plain", "text/csv",
    "application/msword",
    "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    "application/vnd.ms-excel",
    "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
}
ALLOWED_UPLOAD_EXTENSIONS = {
    ".jpg", ".jpeg", ".png", ".gif", ".webp", ".heic",
    ".pdf", ".txt", ".csv", ".doc", ".docx", ".xls", ".xlsx",
}

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
