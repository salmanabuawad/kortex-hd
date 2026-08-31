"""Create an account or set its password from the command line.

    python -m app.set_password it@buqata.muni.il --password '...' --role admin
    python -m app.set_password someone@buqata.muni.il --password '...' --force-change

Intended for bootstrapping and for recovering an administrator who is locked
out. Everyday password resets belong in the user directory in the UI, where they
are attributed to the administrator who performed them.

The password is read from --password, or from the HELPDESK_PASSWORD environment
variable when --password is omitted, so it need not appear in shell history.
"""
import argparse
import os
import sys

from .constants import Role
from .db import SessionLocal
from .models import User
from .security import hash_password, password_problem
from .services import audit


def main() -> None:
    parser = argparse.ArgumentParser(description="create an account or set its password")
    parser.add_argument("email")
    parser.add_argument("--password", help="defaults to $HELPDESK_PASSWORD")
    parser.add_argument("--name", help="full name, used only when creating")
    parser.add_argument("--role", default=Role.ADMIN, choices=sorted(Role.ALL))
    parser.add_argument("--force-change", action="store_true",
                        help="require a password change at next login")
    parser.add_argument("--allow-weak", action="store_true",
                        help="skip the strength check (use only for a deliberate temporary password)")
    args = parser.parse_args()

    password = args.password or os.getenv("HELPDESK_PASSWORD")
    if not password:
        sys.exit("provide --password or set HELPDESK_PASSWORD")

    problem = password_problem(password)
    if problem and not args.allow_weak:
        sys.exit(f"{problem} (pass --allow-weak to override)")
    if problem:
        print(f"warning: {problem}")

    email = args.email.strip().lower()
    db = SessionLocal()
    try:
        user = db.query(User).filter(User.email == email).first()
        if user:
            user.password_hash = hash_password(password)
            user.must_change_password = args.force_change
            if args.role and user.role != args.role:
                user.role = args.role
                print(f"role changed to {args.role}")
            audit.system(db, action="password_reset", details={"email": email, "via": "cli"})
            print(f"updated {email}")
        else:
            user = User(
                full_name=args.name or email.split("@")[0],
                email=email,
                role=args.role,
                password_hash=hash_password(password),
                active=True,
                must_change_password=args.force_change,
            )
            db.add(user)
            audit.system(db, action="user_created", details={"email": email, "via": "cli"})
            print(f"created {email} with role {args.role}")

        db.commit()
        print(f"must_change_password = {user.must_change_password}")
    finally:
        db.close()


if __name__ == "__main__":
    main()
