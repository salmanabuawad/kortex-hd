"""Set one temporary password across the directory, to be changed at next login.

    python -m app.reset_all_passwords --allow-weak --exclude it@buqata.muni.il --yes

For onboarding, when accounts are handed out in person or on paper and every
holder is expected to choose their own password the first time they sign in.
Each account is flagged `must_change_password`, so the temporary password only
ever survives until its owner uses it once.

That flag is also the reason this is worth thinking about twice. A shared
temporary password on an internet-facing site means anyone who learns it can
sign in as any colleague who has not signed in yet -- and, because the first
login is what sets the permanent password, take the account rather than merely
read it. The window closes per account as each person signs in. Prefer
--per-user, which prints one random password per account for distribution, when
the list cannot be handed out promptly.

The password is read from --password or $HELPDESK_PASSWORD, so it need not
appear in shell history.
"""
import argparse
import os
import secrets
import string
import sys

from .db import SessionLocal
from .models import User
from .security import hash_password, password_problem
from .services import audit

ALPHABET = string.ascii_lowercase + string.ascii_uppercase + string.digits


def random_password(length: int = 12) -> str:
    """Twelve characters from a mixed alphabet, retried until it satisfies the
    same rule the change-password form applies."""
    while True:
        candidate = ''.join(secrets.choice(ALPHABET) for _ in range(length))
        if password_problem(candidate) is None:
            return candidate


def main() -> None:
    parser = argparse.ArgumentParser(description="set a temporary password for every account")
    parser.add_argument("--password", help="defaults to $HELPDESK_PASSWORD")
    parser.add_argument("--per-user", action="store_true",
                        help="give each account its own random password and print the list")
    parser.add_argument("--exclude", action="append", default=[], metavar="EMAIL",
                        help="leave this account alone (repeatable)")
    parser.add_argument("--include-inactive", action="store_true",
                        help="also reset accounts that are not active")
    parser.add_argument("--allow-weak", action="store_true",
                        help="accept a password below the strength rule")
    parser.add_argument("--no-force-change", action="store_true",
                        help="do NOT require a change at next login (rarely what you want)")
    parser.add_argument("--yes", action="store_true", help="skip the confirmation prompt")
    args = parser.parse_args()

    password = None
    if not args.per_user:
        password = args.password or os.getenv("HELPDESK_PASSWORD")
        if not password:
            sys.exit("provide --password, set HELPDESK_PASSWORD, or pass --per-user")
        problem = password_problem(password)
        if problem and not args.allow_weak:
            sys.exit(f"{problem} (pass --allow-weak to override)")
        if problem:
            print(f"warning: {problem}")

    skip = {e.strip().lower() for e in args.exclude}
    force_change = not args.no_force_change

    db = SessionLocal()
    try:
        query = db.query(User)
        if not args.include_inactive:
            query = query.filter(User.active.is_(True))
        users = [u for u in query.order_by(User.email).all() if u.email.lower() not in skip]

        if not users:
            sys.exit("no accounts matched")

        print(f"about to reset {len(users)} account(s); "
              f"force change at next login: {force_change}")
        for email in sorted(skip):
            print(f"  excluded: {email}")
        if not args.yes:
            if input("type 'reset' to continue: ").strip() != "reset":
                sys.exit("cancelled")

        issued: list[tuple[str, str]] = []
        for user in users:
            value = random_password() if args.per_user else password
            user.password_hash = hash_password(value)
            user.must_change_password = force_change
            if args.per_user:
                issued.append((user.email, value))

        # One audit line for the operation, not 69 -- the detail that matters
        # afterwards is that a bulk reset happened, how many it touched, and
        # whether the holders are obliged to replace it.
        audit.system(db, action="bulk_password_reset", details={
            "count": len(users),
            "per_user": args.per_user,
            "force_change": force_change,
            "excluded": sorted(skip),
        })
        db.commit()

        print(f"reset {len(users)} account(s)")
        if issued:
            print("\nemail,password")
            for email, value in issued:
                print(f"{email},{value}")
    finally:
        db.close()


if __name__ == "__main__":
    main()
