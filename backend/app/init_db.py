"""Create any missing tables. Run explicitly (deploy step), never on import.

    python -m app.init_db
"""
from .db import Base, engine
from . import models  # noqa: F401  -- registers the mappers on Base


def main() -> None:
    Base.metadata.create_all(bind=engine)
    print("tables ready")


if __name__ == "__main__":
    main()
