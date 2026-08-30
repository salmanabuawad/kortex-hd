"""Runtime configuration. Values come from the environment (see backend/.env.example)."""
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
FRONTEND_URL = os.getenv("FRONTEND_URL", "http://localhost:5173")
UPLOAD_DIR = os.getenv("UPLOAD_DIR", "uploads")
TOKEN_TTL_HOURS = int(os.getenv("TOKEN_TTL_HOURS", "12"))

if not DATABASE_URL.startswith("postgresql"):
    raise RuntimeError(
        f"DATABASE_URL must be a postgresql:// URL, got {DATABASE_URL.split('://')[0]!r}"
    )

if IS_PRODUCTION and not JWT_SECRET:
    raise RuntimeError("JWT_SECRET must be set when ENV=production")
