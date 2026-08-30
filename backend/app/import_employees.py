"""Import council employees from the HR spreadsheet into the user directory.

    python -m app.import_employees "רשימת עובדים.xlsx" --password '...' --dry-run
    python -m app.import_employees "רשימת עובדים.xlsx" --password '...'

Columns are matched by Hebrew header name, not position, so a reordered export
still imports correctly.

Deliberately NOT imported: national ID (ת.זהות) and date of birth. A service
desk never needs either, and copying them into a second system widens the
exposure of personal data for no operational benefit.

Employees with no address on file get a generated @buqata.muni.il login so they
can still sign in; the script lists them so an administrator can correct the
address afterwards. Notifications to a generated address will not arrive.
"""
import argparse
import re
import sys
import unicodedata

import openpyxl
from sqlalchemy.orm import Session

from .constants import Role
from .db import SessionLocal
from .models import Department, User
from .security import hash_password

COLUMNS = {
    "department": "תיאור מחלקה",
    "last_name": "שם משפחה",
    "first_name": "שם פרטי",
    "title": "תיאור דירוג",
    "phone": "טלפון",
    "mobile": "טלפון נייד",
    "email": "אימייל",
    "org_phone": "טלפון ארגוני",
    "org_email": "אימייל אירגוני",
}

DOMAIN = "buqata.muni.il"

# Hebrew -> Latin, enough to build a readable login from a name.
TRANSLITERATE = {
    "א": "a", "ב": "b", "ג": "g", "ד": "d", "ה": "h", "ו": "v", "ז": "z",
    "ח": "h", "ט": "t", "י": "y", "כ": "k", "ך": "k", "ל": "l", "מ": "m",
    "ם": "m", "נ": "n", "ן": "n", "ס": "s", "ע": "a", "פ": "p", "ף": "f",
    "צ": "ts", "ץ": "ts", "ק": "k", "ר": "r", "ש": "sh", "ת": "t",
}


def clean(value) -> str:
    if value is None:
        return ""
    text = str(value).strip()
    return "" if text in {"", "None", "nan"} else text


def looks_like_email(value: str) -> bool:
    return bool(re.match(r"^[^@\s]+@[^@\s]+\.[^@\s]+$", value.strip()))


def transliterate(text: str) -> str:
    out = []
    for char in text:
        if char in TRANSLITERATE:
            out.append(TRANSLITERATE[char])
        elif char.isascii() and char.isalnum():
            out.append(char.lower())
        elif char in " -'\"":
            out.append(".")
        # Anything else (quotes, gershayim, diacritics) is dropped.
    slug = "".join(out)
    slug = unicodedata.normalize("NFKD", slug)
    slug = re.sub(r"\.+", ".", slug).strip(".")
    return slug or "user"


def read_rows(path: str) -> list[dict]:
    workbook = openpyxl.load_workbook(path, data_only=True)
    sheet = workbook.worksheets[0]
    rows = list(sheet.iter_rows(values_only=True))
    if not rows:
        sys.exit("the spreadsheet is empty")

    headers = [clean(cell) for cell in rows[0]]
    index: dict[str, int] = {}
    for key, header in COLUMNS.items():
        for position, value in enumerate(headers):
            if value == header:
                index[key] = position
                break
    missing = [COLUMNS[k] for k in ("last_name", "first_name") if k not in index]
    if missing:
        sys.exit(f"required column(s) not found: {', '.join(missing)}")

    people = []
    for raw in rows[1:]:
        get = lambda key: clean(raw[index[key]]) if key in index and index[key] < len(raw) else ""
        first, last = get("first_name"), get("last_name")
        if not first and not last:
            continue                                   # blank or spacer row
        people.append({
            "full_name": f"{first} {last}".strip(),
            "department": get("department"),
            "title": get("title"),
            "email": next((e for e in (get("org_email"), get("email")) if looks_like_email(e)), ""),
            "phone": next((p for p in (get("org_phone"), get("mobile"), get("phone")) if p), ""),
        })
    return people


def assign_emails(people: list[dict], existing: set[str]) -> None:
    """Fill in a generated login for anyone without a real address, keeping
    every login unique across the file and the existing directory."""
    taken = set(existing)
    for person in people:
        address = person["email"].lower()
        if address and address not in taken:
            person["generated"] = False
            person["email"] = address
            taken.add(address)
            continue

        base = transliterate(person["full_name"])
        candidate = f"{base}@{DOMAIN}"
        suffix = 2
        while candidate in taken:
            candidate = f"{base}{suffix}@{DOMAIN}"
            suffix += 1
        person["generated"] = True
        person["email"] = candidate
        taken.add(candidate)


def department_for(db: Session, name: str, cache: dict[str, Department]) -> Department | None:
    if not name:
        return None
    if name in cache:
        return cache[name]
    row = db.query(Department).filter(Department.name == name).first()
    if not row:
        row = Department(name=name)
        db.add(row)
        db.flush()
    cache[name] = row
    return row


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("path", help="path to the .xlsx export")
    parser.add_argument("--password", required=True,
                        help="initial password given to every imported account")
    parser.add_argument("--role", default=Role.REQUESTER, choices=sorted(Role.ALL))
    parser.add_argument("--dry-run", action="store_true",
                        help="report what would happen without writing anything")
    args = parser.parse_args()

    people = read_rows(args.path)
    print(f"read {len(people)} employees from the spreadsheet")

    db = SessionLocal()
    try:
        existing = {email.lower() for (email,) in db.query(User.email).all()}
        assign_emails(people, existing)

        generated = [p for p in people if p["generated"]]
        skipped = [p for p in people if p["email"] in existing]
        to_create = [p for p in people if p["email"] not in existing]

        print(f"  {len(to_create)} to create")
        print(f"  {len(skipped)} already in the directory (left untouched)")
        print(f"  {len(generated)} without an address on file -> generated a login")

        if generated:
            print("\naccounts with a generated login (notifications will not reach them):")
            for person in generated:
                print(f"  {person['full_name']:<28} {person['email']}")

        if args.dry_run:
            print("\ndry run: nothing written")
            return

        password_hash = hash_password(args.password)
        cache: dict[str, Department] = {}
        created = 0
        for person in to_create:
            department = department_for(db, person["department"], cache)
            db.add(User(
                full_name=person["full_name"],
                email=person["email"],
                phone=person["phone"] or None,
                title=person["title"] or None,
                department_id=department.id if department else None,
                role=args.role,
                password_hash=password_hash,
                active=True,
                must_change_password=True,
            ))
            created += 1
        db.commit()
        print(f"\ncreated {created} accounts, all flagged to change password on first login")
    finally:
        db.close()


if __name__ == "__main__":
    main()
