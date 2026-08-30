"""Seed the initial admin account and the default categories.

    python -m app.seed                      # admin only, password from ADMIN_PASSWORD
    python -m app.seed --demo               # also create demo user/resolver (blocked in production)

Idempotent: existing users and categories are left untouched.
"""
import argparse
import os
import sys

from .config import IS_PRODUCTION
from .db import SessionLocal
from . import models
from .security import hash_password

DEFAULT_CATEGORIES = [
    dict(name="מחשוב ותקשורת", description="מחשבים, רשת ואינטרנט", cost_threshold=500, hours_threshold=3, approval_new_service=True),
    dict(name="מערכות מידע", description="יישומים והרשאות", cost_threshold=1000, hours_threshold=6),
    dict(name="ציוד והדפסה", description="מדפסות וציוד קצה", cost_threshold=750, hours_threshold=4),
]


def seed(demo: bool = False) -> None:
    if demo and IS_PRODUCTION:
        sys.exit("refusing to create demo accounts while ENV=production")

    admin_email = os.getenv("ADMIN_EMAIL", "admin@buqata.muni.il").lower()
    admin_password = os.getenv("ADMIN_PASSWORD")
    db = SessionLocal()
    try:
        admin = db.query(models.User).filter(models.User.email == admin_email).first()
        if not admin:
            if not admin_password:
                sys.exit("set ADMIN_PASSWORD to seed the initial admin account")
            admin = models.User(
                name=os.getenv("ADMIN_NAME", "מנהל מערכת"),
                email=admin_email,
                phone=os.getenv("ADMIN_PHONE"),
                password_hash=hash_password(admin_password),
                role="admin",
                force_password_change=True,
            )
            db.add(admin)
            db.flush()
            print(f"created admin {admin_email}")
        else:
            print(f"admin {admin_email} already exists, leaving it alone")

        resolver = admin
        if demo:
            for email, name, role in [
                ("user@buqata.muni.il", "משתמש מועצה", "user"),
                ("resolver@buqata.muni.il", "אחראי תמיכה", "resolver"),
            ]:
                if db.query(models.User).filter(models.User.email == email).first():
                    continue
                u = models.User(name=name, email=email, password_hash=hash_password("password123"), role=role)
                db.add(u)
                db.flush()
                if role == "resolver":
                    resolver = u
                print(f"created demo {role} {email}")

        for spec in DEFAULT_CATEGORIES:
            if db.query(models.Category).filter(models.Category.name == spec["name"]).first():
                continue
            db.add(models.Category(resolver_id=resolver.id, escalation_id=admin.id, **spec))
            print(f"created category {spec['name']}")

        db.commit()
    finally:
        db.close()


if __name__ == "__main__":
    parser = argparse.ArgumentParser()
    parser.add_argument("--demo", action="store_true", help="also create demo user/resolver accounts")
    seed(**vars(parser.parse_args()))
