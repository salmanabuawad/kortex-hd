"""Seed reference data, the initial admin, and (optionally) a realistic demo set.

    python -m app.seed                 # departments, request types, categories, admin
    python -m app.seed --demo          # + demo staff, sample tickets, subtasks, approvals

Idempotent: existing rows are left alone, so it is safe to re-run after a deploy.
`--demo` refuses to run when ENV=production.
"""
import argparse
import os
import sys
from datetime import date, datetime, timedelta, timezone

from sqlalchemy.orm import Session

from .config import IS_PRODUCTION
from .constants import (
    ApprovalStatus, ApprovalTrigger, AssigneeType, Channel, Priority, Role, SubtaskStatus,
    TicketApprovalState, TicketStatus,
)
from .db import SessionLocal
from .models import (
    Approval, Category, CategoryRequestType, Department, KnownIssue, RequestType, Setting,
    Subtask, SubtaskComment, Ticket, TicketAssignment, TicketComment, User, WorkflowRule,
)
from .security import hash_password
from .services import audit, sla, tokens

DEPARTMENTS = ["הנהלה", "מחשוב", "חינוך", "הנדסה", "גזברות", "רווחה", "ביטחון"]

REQUEST_TYPES = [
    dict(key="fault", name="תקלה", description="משהו שהיה תקין והפסיק לעבוד",
         icon="AlertTriangle", requires_approval_default=False, sort_order=1),
    dict(key="new_service", name="שירות חדש", description="בקשה לציוד, מערכת או הרשאה חדשים",
         icon="Sparkles", requires_approval_default=True, sort_order=2),
]

CATEGORIES = [
    dict(name="מחשוב ותקשורת", description="מחשבים, רשת, אינטרנט וטלפוניה",
         icon="Network", color="blue", sla_hours=8,
         cost_threshold=500, hours_threshold=3, approval_new_service=True, sort_order=1),
    dict(name="מערכות מידע", description="יישומים, הרשאות וממשקים",
         icon="Database", color="purple", sla_hours=24,
         cost_threshold=1000, hours_threshold=6, approval_new_service=True, sort_order=2),
    dict(name="ציוד והדפסה", description="מדפסות, סורקים וציוד קצה",
         icon="Printer", color="amber", sla_hours=24,
         cost_threshold=750, hours_threshold=4, approval_new_service=False, sort_order=3),
    dict(name="מבנים ותשתיות", description="חשמל, מיזוג, אחזקת מבנה",
         icon="Building2", color="green", sla_hours=48,
         cost_threshold=2000, hours_threshold=8, approval_new_service=False, sort_order=4),
    dict(name="ביטחון ומצלמות", description="מצלמות אבטחה, בקרת כניסה",
         icon="ShieldCheck", color="red", sla_hours=12,
         cost_threshold=1500, hours_threshold=5, approval_new_service=True, sort_order=5),
]

KNOWN_ISSUES = [
    dict(title="אין חיבור לאינטרנט במשרד",
         summary="לפני פתיחת קריאה: ודאו שכבל הרשת מחובר, ונסו לנתק ולחבר מחדש את הנתב.",
         resolution="ברוב המקרים אתחול הנתב פותר את התקלה תוך שתי דקות.",
         category_index=0),
    dict(title="המדפסת אינה מדפיסה",
         summary="בדקו שיש נייר וטונר, ושהמדפסת מופיעה כזמינה ברשימת המדפסות.",
         resolution="ניקוי תור ההדפסה פותר את רוב התקלות.",
         category_index=2),
    dict(title="שכחתי סיסמה למערכת",
         summary="איפוס סיסמה מתבצע על ידי מנהל המערכת דרך ספריית המשתמשים.",
         resolution="פנו למוקד עם פרטי הזיהוי שלכם.",
         category_index=1),
]

DEMO_USERS = [
    dict(email="admin@buqata.muni.il", full_name="מנהל מערכת", role=Role.ADMIN,
         department="מחשוב", title="מנהל מערכות מידע", phone="050-0000001"),
    dict(email="resolver@buqata.muni.il", full_name="סאמר אבו סאלח", role=Role.RESOLVER,
         department="מחשוב", title="אחראי תמיכה טכנית", phone="050-0000003"),
    dict(email="resolver2@buqata.muni.il", full_name="ראמי חלבי", role=Role.RESOLVER,
         department="הנדסה", title="אחראי אחזקה", phone="050-0000004"),
    dict(email="approver@buqata.muni.il", full_name="נור אלדין ספדי", role=Role.APPROVER,
         department="גזברות", title="גזבר המועצה", phone="050-0000005"),
    dict(email="user@buqata.muni.il", full_name="לינא מרעי", role=Role.REQUESTER,
         department="חינוך", title="מזכירת מחלקת חינוך", phone="050-0000002"),
    dict(email="user2@buqata.muni.il", full_name="ג׳מאל אבו זיד", role=Role.REQUESTER,
         department="רווחה", title="עובד סוציאלי", phone="050-0000006"),
]

DEMO_TICKETS = [
    dict(subject="תקלת אינטרנט במחלקת חינוך",
         description="מהבוקר אין חיבור לאינטרנט בכל המחשבים במחלקת חינוך. הנתב דולק אך נורית האינטרנט כבויה.",
         category=0, request_type="fault", priority=Priority.HIGH,
         requester="user@buqata.muni.il", status=TicketStatus.IN_PROGRESS, age_hours=30),
    dict(subject="תקלה במדפסת בקומה השנייה",
         description="המדפסת המשותפת בקומה השנייה מוציאה דפים מרוחים. הוחלף טונר לפני שבוע.",
         category=2, request_type="fault", priority=Priority.NORMAL,
         requester="user2@buqata.muni.il", status=TicketStatus.VIEWED, age_hours=6),
    dict(subject="בקשה למחשב נייד חדש לעובד חדש",
         description="נקלט עובד חדש במחלקת רווחה ונדרש מחשב נייד, מסך ותחנת עגינה.",
         category=1, request_type="new_service", priority=Priority.NORMAL,
         requester="user2@buqata.muni.il", status=TicketStatus.ASSIGNED,
         estimated_cost=4800, estimated_hours=2, age_hours=20),
    dict(subject="הרשאות למערכת הגבייה",
         description="נדרשות הרשאות צפייה בלבד במערכת הגבייה עבור מזכירת מחלקת חינוך.",
         category=1, request_type="new_service", priority=Priority.LOW,
         requester="user@buqata.muni.il", status=TicketStatus.ASSIGNED, age_hours=52),
    dict(subject="מצלמות אבטחה בכניסה הראשית אינן מקליטות",
         description="שתי מצלמות בכניסה הראשית מציגות תמונה חיה אך אינן שומרות הקלטות מזה שלושה ימים.",
         category=4, request_type="fault", priority=Priority.URGENT,
         requester="user@buqata.muni.il", status=TicketStatus.IN_PROGRESS,
         estimated_cost=2400, estimated_hours=6, age_hours=40),
    dict(subject="תקלה בטלפון במשרד הגזברות",
         description="הטלפון במשרד הגזברות מנתק שיחות באופן אקראי.",
         category=0, request_type="fault", priority=Priority.NORMAL,
         requester="user2@buqata.muni.il", status=TicketStatus.RESOLVED, age_hours=96,
         resolution="הוחלף כבל הרשת בעמדה. נבדק ותקין."),
]

DEFAULT_SETTINGS = [
    ("council.name", "מועצה מקומית בוקעאתא", "general"),
    ("council.support_email", "support@buqata.muni.il", "general"),
    ("sla.default_hours", "24", "sla"),
    ("sla.warning_fraction", "0.75", "sla"),
    # How long a ticket may take, by how urgent it is: two hours, one day,
    # three days, one week.
    ("sla.hours_urgent", "2", "sla"),
    ("sla.hours_high", "24", "sla"),
    ("sla.hours_normal", "72", "sla"),
    ("sla.hours_low", "168", "sla"),
    ("notifications.email_enabled", "true", "notifications"),
    ("notifications.sms_enabled", "false", "notifications"),
    ("notifications.whatsapp_enabled", "false", "notifications"),
    ("security.password_min_length", "10", "security"),
    ("security.session_hours", "12", "security"),
    ("tickets.allow_requester_priority", "true", "general"),
]


def _get_or_create(db: Session, model, defaults: dict | None = None, **lookup):
    row = db.query(model).filter_by(**lookup).first()
    if row:
        return row, False
    row = model(**lookup, **(defaults or {}))
    db.add(row)
    db.flush()
    return row, True


def seed_reference(db: Session) -> dict:
    departments = {}
    for name in DEPARTMENTS:
        row, _ = _get_or_create(db, Department, name=name)
        departments[name] = row

    request_types = {}
    for spec in REQUEST_TYPES:
        key = spec.pop("key") if "key" in spec else None
        spec = dict(spec)
        key = spec.pop("key", key) or spec["name"]
        row, created = _get_or_create(db, RequestType, defaults=spec, key=key)
        request_types[key] = row
        if created:
            print(f"  request type: {row.name}")

    for key, value, group in DEFAULT_SETTINGS:
        _get_or_create(db, Setting, defaults={"value": value, "group": group}, key=key)

    return {"departments": departments, "request_types": request_types}


def seed_admin(db: Session, departments: dict) -> User:
    email = os.getenv("ADMIN_EMAIL", "admin@buqata.muni.il").lower()
    admin = db.query(User).filter(User.email == email).first()
    if admin:
        print(f"  admin {email} already exists")
        return admin
    password = os.getenv("ADMIN_PASSWORD")
    if not password:
        sys.exit("set ADMIN_PASSWORD to seed the initial admin account")
    admin = User(
        full_name=os.getenv("ADMIN_NAME", "מנהל מערכת"),
        email=email,
        phone=os.getenv("ADMIN_PHONE"),
        password_hash=hash_password(password),
        role=Role.ADMIN,
        department_id=departments.get("מחשוב").id if departments.get("מחשוב") else None,
        title="מנהל מערכות מידע",
        must_change_password=True,
    )
    db.add(admin)
    db.flush()
    print(f"  created admin {email}")
    return admin


def seed_categories(db: Session, ref: dict, resolver: User, escalation: User) -> list[Category]:
    result = []
    for spec in CATEGORIES:
        spec = dict(spec)
        name = spec.pop("name")
        row = db.query(Category).filter(Category.name == name).first()
        if not row:
            row = Category(name=name, **spec)
            row.resolver_id = resolver.id
            row.escalation_id = escalation.id
            db.add(row)
            db.flush()
            for rt in ref["request_types"].values():
                db.add(CategoryRequestType(category_id=row.id, request_type_id=rt.id))
            print(f"  category: {name}")
        result.append(row)
    return result


def seed_demo(db: Session, ref: dict, categories: list[Category]) -> None:
    departments = ref["departments"]
    request_types = ref["request_types"]
    users: dict[str, User] = {}

    for spec in DEMO_USERS:
        email = spec["email"]
        row = db.query(User).filter(User.email == email).first()
        if not row:
            dept = departments.get(spec["department"])
            row = User(
                full_name=spec["full_name"], email=email, phone=spec["phone"],
                role=spec["role"], title=spec["title"],
                department_id=dept.id if dept else None,
                password_hash=hash_password("Buqata2026!"),
                must_change_password=False,
            )
            db.add(row)
            db.flush()
            print(f"  demo user: {email} ({spec['role']})")
        users[email] = row

    resolver = users["resolver@buqata.muni.il"]
    resolver2 = users["resolver2@buqata.muni.il"]
    approver = users["approver@buqata.muni.il"]

    # Point categories at the demo staff now that they exist.
    for index, category in enumerate(categories):
        if category.resolver_id is None or category.resolver.role == Role.ADMIN:
            category.resolver_id = resolver2.id if index >= 3 else resolver.id
        category.escalation_id = approver.id

    for spec in KNOWN_ISSUES:
        if db.query(KnownIssue).filter(KnownIssue.title == spec["title"]).first():
            continue
        db.add(KnownIssue(
            title=spec["title"], summary=spec["summary"], resolution=spec["resolution"],
            category_id=categories[spec["category_index"]].id, views=7))

    if not db.query(WorkflowRule).first():
        db.add(WorkflowRule(
            name="רכש מעל 3,000 ₪ מחייב אישור גזבר",
            description="כל בקשה בעלות משוערת גבוהה מ-3,000 ₪ מועברת לאישור הגזבר.",
            cost_gt=3000, approver_id=approver.id, sort_order=1))
        db.add(WorkflowRule(
            name="שירות חדש במערכות מידע מחייב אישור",
            description="בקשות לשירות חדש בקטגוריית מערכות מידע דורשות אישור.",
            category_id=categories[1].id,
            request_type_id=request_types["new_service"].id,
            approver_id=approver.id, sort_order=2))
        print("  workflow rules")

    if db.query(Ticket).count():
        print("  tickets already present, skipping")
        db.flush()
        return

    now = datetime.now(timezone.utc)
    for index, spec in enumerate(DEMO_TICKETS, start=1):
        category = categories[spec["category"]]
        rt = request_types[spec["request_type"]]
        requester = users[spec["requester"]]
        created = now - timedelta(hours=spec["age_hours"])

        ticket = Ticket(
            number=f"{created.strftime('%y%m')}{index:05d}",
            subject=spec["subject"],
            description=spec["description"],
            category_id=category.id,
            request_type_id=rt.id,
            requester_id=requester.id,
            resolver_id=category.resolver_id,
            priority=spec["priority"],
            status=spec["status"],
            estimated_cost=spec.get("estimated_cost"),
            estimated_hours=spec.get("estimated_hours"),
            created_at=created,
            updated_at=created + timedelta(hours=1),
            sla_due_at=sla.due_at(category, created),
        )
        if spec["status"] in (TicketStatus.RESOLVED, TicketStatus.REJECTED):
            ticket.resolved_at = created + timedelta(hours=4)
            ticket.resolution_note = spec.get("resolution")
        if spec["status"] in (TicketStatus.VIEWED, TicketStatus.IN_PROGRESS):
            ticket.first_viewed_at = created + timedelta(minutes=30)
        db.add(ticket)
        db.flush()

        db.add(TicketAssignment(
            ticket_id=ticket.id, to_user_id=ticket.resolver_id, to_category_id=category.id,
            actor_id=requester.id, reason="הקצאה אוטומטית לפי קטגוריה"))
        audit.record(db, action="ticket_created", actor=requester, ticket_id=ticket.id,
                     details={"category": category.name})
        audit.system(db, action="ticket_assigned", ticket_id=ticket.id,
                     details={"to": ticket.resolver.full_name if ticket.resolver else ""})

        # An approval that actually blocks work, so the UI has one to show.
        if spec.get("estimated_cost") and spec["estimated_cost"] > (category.cost_threshold or 0):
            db.add(Approval(
                ticket_id=ticket.id,
                reason=f"עלות משוערת {spec['estimated_cost']:,.0f} ₪ חורגת מסף האישור",
                trigger=ApprovalTrigger.COST,
                amount=spec["estimated_cost"], hours=spec.get("estimated_hours"),
                requested_by_id=ticket.resolver_id, approver_id=approver.id,
                status=ApprovalStatus.PENDING, requested_at=created + timedelta(hours=2)))
            ticket.approval_state = TicketApprovalState.PENDING
            audit.system(db, action="approval_requested", ticket_id=ticket.id)

        if spec["status"] in (TicketStatus.IN_PROGRESS, TicketStatus.RESOLVED):
            db.add(TicketComment(
                ticket_id=ticket.id, author_id=requester.id, author_name=requester.full_name,
                body="תודה, ממתינה לעדכון.", internal=False,
                created_at=created + timedelta(hours=1)))
            db.add(TicketComment(
                ticket_id=ticket.id, author_id=ticket.resolver_id,
                author_name=ticket.resolver.full_name if ticket.resolver else "מטפל",
                body="בטיפול, נעדכן בהמשך היום.", internal=False,
                created_at=created + timedelta(hours=2)))
            audit.record(db, action="comment_added", actor=requester, ticket_id=ticket.id)

    # One external subtask with a live guest link, and one internal subtask.
    camera_ticket = db.query(Ticket).filter(
        Ticket.subject.like("%מצלמות אבטחה%")).first()
    if camera_ticket:
        external = Subtask(
            number=f"{camera_ticket.number}-01",
            ticket_id=camera_ticket.id,
            title="בדיקת מערכת ההקלטה על ידי ספק המצלמות",
            description="נדרשת בדיקה של יחידת ההקלטה והחלפת דיסק במידת הצורך.",
            assignee_type=AssigneeType.EXTERNAL,
            external_name="עומר טכנולוגיות",
            external_org="עומר טכנולוגיות אבטחה בע״מ",
            external_email="service@omer-security.example",
            external_phone="04-6000000",
            external_channel=Channel.EMAIL,
            due_date=(now + timedelta(days=3)).date(),
            priority=Priority.HIGH,
            created_by_id=camera_ticket.resolver_id,
        )
        db.add(external)
        db.flush()
        _, plaintext = tokens.issue(db, external, issued_by_id=camera_ticket.resolver_id)
        db.add(SubtaskComment(
            subtask_id=external.id, author_name="עומר טכנולוגיות", author_kind="external",
            body="קיבלנו את הפנייה, נגיע ביום ראשון בבוקר.", internal=False))
        audit.system(db, action="external_link_issued",
                     ticket_id=camera_ticket.id, subtask_id=external.id)
        print(f"  demo guest link: /external/subtask/{plaintext}")

        internal = Subtask(
            number=f"{camera_ticket.number}-02",
            ticket_id=camera_ticket.id,
            title="תיאום גישה לחדר השרתים",
            description="לתאם עם מחלקת ביטחון גישה לחדר השרתים ביום הביקור.",
            assignee_type=AssigneeType.INTERNAL,
            assignee_user_id=resolver2.id,
            due_date=(now + timedelta(days=2)).date(),
            priority=Priority.NORMAL,
            created_by_id=camera_ticket.resolver_id,
        )
        db.add(internal)


def seed(demo: bool = False) -> None:
    if demo and IS_PRODUCTION:
        sys.exit("refusing to create demo data while ENV=production")

    db = SessionLocal()
    try:
        print("seeding reference data")
        ref = seed_reference(db)
        admin = seed_admin(db, ref["departments"])
        categories = seed_categories(db, ref, resolver=admin, escalation=admin)
        if demo:
            print("seeding demo data")
            seed_demo(db, ref, categories)
        db.commit()
        print("done")
    finally:
        db.close()


if __name__ == "__main__":
    parser = argparse.ArgumentParser()
    parser.add_argument("--demo", action="store_true",
                        help="also create demo staff, tickets and subtasks")
    seed(**vars(parser.parse_args()))
