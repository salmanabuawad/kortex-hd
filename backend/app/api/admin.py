"""Administration: categories, users, departments, request types, workflow rules,
settings, and the knowledge base."""
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from .. import schemas
from ..constants import Priority, Role
from ..db import get_db
from ..models import (
    Category, CategoryRequestType, Department, KnownIssue, RequestType, Setting, Ticket,
    User, WorkflowRule,
)
from ..security import hash_password, password_problem
from ..services import audit, mail_settings
from .deps import current_user, require_admin, require_staff
from . import serializers as S

router = APIRouter(prefix="/api", tags=["admin"])


# --- categories -------------------------------------------------------------

@router.get("/categories")
def list_categories(
    include_inactive: bool = False,
    user: User = Depends(current_user),
    db: Session = Depends(get_db),
):
    query = db.query(Category)
    if not (include_inactive and user.role == Role.ADMIN):
        query = query.filter(Category.active.is_(True))
    rows = query.order_by(Category.sort_order, Category.name).all()
    admin_view = user.role == Role.ADMIN
    return {"items": [S.category(c, admin=admin_view) for c in rows]}


def _apply_category(db: Session, category: Category, data: schemas.CategoryIn) -> None:
    if data.default_priority not in Priority.ALL:
        raise HTTPException(400, "דחיפות ברירת מחדל לא חוקית")
    for field in ("name", "description", "icon", "color", "resolver_id", "backup_resolver_id",
                  "escalation_id", "sla_hours", "default_priority", "approval_new_service",
                  "cost_threshold", "hours_threshold", "active"):
        setattr(category, field, getattr(data, field))

    db.query(CategoryRequestType).filter(
        CategoryRequestType.category_id == category.id).delete(synchronize_session=False)
    for rt_id in data.request_type_ids:
        if db.get(RequestType, rt_id):
            db.add(CategoryRequestType(category_id=category.id, request_type_id=rt_id))


@router.post("/categories", status_code=201)
def create_category(
    data: schemas.CategoryIn,
    user: User = Depends(require_admin),
    db: Session = Depends(get_db),
):
    if db.query(Category).filter(Category.name == data.name).first():
        raise HTTPException(409, "קטגוריה בשם זה כבר קיימת")
    category = Category(name=data.name)
    db.add(category)
    db.flush()
    _apply_category(db, category, data)
    audit.record(db, action="category_created", actor=user, details={"name": data.name})
    db.commit()
    db.refresh(category)
    return S.category(category, admin=True)


@router.patch("/categories/{category_id}")
def update_category(
    category_id: int,
    data: schemas.CategoryIn,
    user: User = Depends(require_admin),
    db: Session = Depends(get_db),
):
    category = db.get(Category, category_id)
    if not category:
        raise HTTPException(404, "הקטגוריה לא נמצאה")
    clash = db.query(Category).filter(
        Category.name == data.name, Category.id != category_id).first()
    if clash:
        raise HTTPException(409, "קטגוריה בשם זה כבר קיימת")
    _apply_category(db, category, data)
    audit.record(db, action="category_updated", actor=user, details={"name": data.name})
    db.commit()
    db.refresh(category)
    return S.category(category, admin=True)


@router.delete("/categories/{category_id}")
def archive_category(
    category_id: int,
    user: User = Depends(require_admin),
    db: Session = Depends(get_db),
):
    """Archive rather than delete when tickets reference the category."""
    category = db.get(Category, category_id)
    if not category:
        raise HTTPException(404, "הקטגוריה לא נמצאה")
    in_use = db.query(Ticket).filter(Ticket.category_id == category_id).count()
    if in_use:
        category.active = False
        audit.record(db, action="category_archived", actor=user,
                     details={"name": category.name, "tickets": in_use})
        db.commit()
        return {"archived": True, "tickets": in_use}
    db.delete(category)
    audit.record(db, action="category_deleted", actor=user, details={"name": category.name})
    db.commit()
    return {"archived": False}


# --- request types ----------------------------------------------------------

@router.get("/request-types")
def list_request_types(
    user: User = Depends(current_user),
    db: Session = Depends(get_db),
):
    rows = db.query(RequestType).order_by(RequestType.sort_order, RequestType.id).all()
    if user.role != Role.ADMIN:
        rows = [r for r in rows if r.active]
    return {"items": [S.request_type(r) for r in rows]}


@router.post("/request-types", status_code=201)
def create_request_type(
    data: schemas.RequestTypeIn,
    user: User = Depends(require_admin),
    db: Session = Depends(get_db),
):
    if db.query(RequestType).filter(RequestType.key == data.key).first():
        raise HTTPException(409, "מזהה סוג בקשה כבר קיים")
    row = RequestType(**data.model_dump())
    db.add(row)
    audit.record(db, action="request_type_created", actor=user, details={"key": data.key})
    db.commit()
    db.refresh(row)
    return S.request_type(row)


@router.patch("/request-types/{type_id}")
def update_request_type(
    type_id: int,
    data: schemas.RequestTypeIn,
    user: User = Depends(require_admin),
    db: Session = Depends(get_db),
):
    row = db.get(RequestType, type_id)
    if not row:
        raise HTTPException(404, "סוג הבקשה לא נמצא")
    for field, value in data.model_dump().items():
        setattr(row, field, value)
    audit.record(db, action="request_type_updated", actor=user, details={"key": row.key})
    db.commit()
    db.refresh(row)
    return S.request_type(row)


# --- users and departments --------------------------------------------------

@router.get("/users")
def list_users(
    q: str | None = None,
    role: str | None = None,
    department_id: int | None = None,
    active: bool | None = None,
    user: User = Depends(require_staff),
    db: Session = Depends(get_db),
):
    query = db.query(User)
    if q:
        like = f"%{q.strip()}%"
        query = query.filter((User.full_name.ilike(like)) | (User.email.ilike(like)))
    if role:
        query = query.filter(User.role == role)
    if department_id:
        query = query.filter(User.department_id == department_id)
    if active is not None:
        query = query.filter(User.active.is_(active))
    rows = query.order_by(User.full_name).all()
    return {"items": [S.user_full(u) for u in rows]}


@router.get("/users/assignable")
def assignable_users(
    user: User = Depends(require_staff),
    db: Session = Depends(get_db),
):
    """Users who can receive a ticket or an internal subtask."""
    rows = (
        db.query(User)
        .filter(User.active.is_(True), User.role.in_([Role.RESOLVER, Role.ADMIN, Role.APPROVER]))
        .order_by(User.full_name)
        .all()
    )
    return {"items": [S.user_brief(u) for u in rows]}


@router.post("/users", status_code=201)
def create_user(
    data: schemas.UserIn,
    user: User = Depends(require_admin),
    db: Session = Depends(get_db),
):
    if data.role not in Role.ALL:
        raise HTTPException(400, "תפקיד לא חוקי")
    # Normalised the same way sign-in and the update path normalise it, so
    # "A@x" and " a@x " cannot become two accounts that both look like one.
    email = str(data.email).strip().lower()
    if db.query(User).filter(User.email == email).first():
        raise HTTPException(409, "משתמש עם כתובת זו כבר קיים")
    problem = password_problem(data.password)
    if problem:
        raise HTTPException(400, problem)

    row = User(
        full_name=data.full_name, email=email, phone=data.phone, role=data.role,
        department_id=data.department_id, title=data.title, active=data.active,
        password_hash=hash_password(data.password), must_change_password=True)
    db.add(row)
    audit.record(db, action="user_created", actor=user, details={"email": email, "role": data.role})
    db.commit()
    db.refresh(row)
    return S.user_full(row)


@router.patch("/users/{user_id}")
def update_user(
    user_id: int,
    data: schemas.UserUpdate,
    user: User = Depends(require_admin),
    db: Session = Depends(get_db),
):
    row = db.get(User, user_id)
    if not row:
        raise HTTPException(404, "המשתמש לא נמצא")
    changes = data.model_dump(exclude_none=True)
    if "role" in changes and changes["role"] not in Role.ALL:
        raise HTTPException(400, "תפקיד לא חוקי")

    # The address is the login, so it is normalised the same way sign-in
    # normalises it, and it has to stay unique or two people could not both log
    # in. The previous address is kept in the audit trail: after a bulk import
    # that invented addresses, "what was this account before?" is a question
    # somebody will ask.
    previous_email = None
    if "email" in changes:
        new_email = str(changes["email"]).strip().lower()
        if new_email != row.email:
            clash = db.query(User).filter(
                User.email == new_email, User.id != row.id).first()
            if clash:
                raise HTTPException(400, f"הכתובת {new_email} כבר משויכת למשתמש אחר")
            previous_email = row.email
        changes["email"] = new_email
    # Refuse to strip the last admin, which would lock everyone out.
    if row.id == user.id and (changes.get("role", row.role) != Role.ADMIN
                              or changes.get("active", row.active) is False):
        remaining = db.query(User).filter(
            User.role == Role.ADMIN, User.active.is_(True), User.id != row.id).count()
        if remaining == 0:
            raise HTTPException(400, "לא ניתן להסיר את מנהל המערכת האחרון")
    for field, value in changes.items():
        setattr(row, field, value)
    details = {"email": row.email, "changes": list(changes)}
    if previous_email:
        details["previous_email"] = previous_email
    audit.record(db, action="user_updated", actor=user, details=details)
    db.commit()
    db.refresh(row)
    return S.user_full(row)


@router.post("/users/{user_id}/reset-password")
def reset_password(
    user_id: int,
    data: schemas.PasswordReset,
    user: User = Depends(require_admin),
    db: Session = Depends(get_db),
):
    row = db.get(User, user_id)
    if not row:
        raise HTTPException(404, "המשתמש לא נמצא")
    problem = password_problem(data.password)
    if problem:
        raise HTTPException(400, problem)
    row.password_hash = hash_password(data.password)
    row.must_change_password = True
    audit.record(db, action="password_reset", actor=user, details={"email": row.email})
    db.commit()
    return {"ok": True}


@router.get("/departments")
def list_departments(
    user: User = Depends(current_user),
    db: Session = Depends(get_db),
):
    rows = db.query(Department).order_by(Department.name).all()
    return {"items": [{"id": d.id, "name": d.name, "active": d.active} for d in rows]}


@router.post("/departments", status_code=201)
def create_department(
    data: schemas.DepartmentIn,
    user: User = Depends(require_admin),
    db: Session = Depends(get_db),
):
    if db.query(Department).filter(Department.name == data.name).first():
        raise HTTPException(409, "מחלקה בשם זה כבר קיימת")
    row = Department(**data.model_dump())
    db.add(row)
    db.commit()
    db.refresh(row)
    return {"id": row.id, "name": row.name, "active": row.active}


# --- workflow rules ---------------------------------------------------------

@router.get("/workflow-rules")
def list_rules(
    user: User = Depends(require_admin),
    db: Session = Depends(get_db),
):
    rows = db.query(WorkflowRule).order_by(WorkflowRule.sort_order, WorkflowRule.id).all()
    return {"items": [S.workflow_rule(r) for r in rows]}


@router.post("/workflow-rules", status_code=201)
def create_rule(
    data: schemas.WorkflowRuleIn,
    user: User = Depends(require_admin),
    db: Session = Depends(get_db),
):
    if (data.category_id is None and data.request_type_id is None
            and data.cost_gt is None and data.hours_gt is None):
        raise HTTPException(400, "לכלל חייב להיות לפחות תנאי אחד")
    row = WorkflowRule(**data.model_dump())
    db.add(row)
    audit.record(db, action="workflow_rule_created", actor=user, details={"name": data.name})
    db.commit()
    db.refresh(row)
    return S.workflow_rule(row)


@router.patch("/workflow-rules/{rule_id}")
def update_rule(
    rule_id: int,
    data: schemas.WorkflowRuleIn,
    user: User = Depends(require_admin),
    db: Session = Depends(get_db),
):
    row = db.get(WorkflowRule, rule_id)
    if not row:
        raise HTTPException(404, "הכלל לא נמצא")
    for field, value in data.model_dump().items():
        setattr(row, field, value)
    audit.record(db, action="workflow_rule_updated", actor=user, details={"name": row.name})
    db.commit()
    db.refresh(row)
    return S.workflow_rule(row)


@router.delete("/workflow-rules/{rule_id}")
def delete_rule(
    rule_id: int,
    user: User = Depends(require_admin),
    db: Session = Depends(get_db),
):
    row = db.get(WorkflowRule, rule_id)
    if not row:
        raise HTTPException(404, "הכלל לא נמצא")
    audit.record(db, action="workflow_rule_deleted", actor=user, details={"name": row.name})
    db.delete(row)
    db.commit()
    return {"ok": True}


# --- settings ---------------------------------------------------------------

@router.get("/settings")
def get_settings(
    user: User = Depends(require_admin),
    db: Session = Depends(get_db),
):
    rows = db.query(Setting).order_by(Setting.group, Setting.key).all()
    grouped: dict[str, dict] = {}
    for row in rows:
        # The mailbox password never leaves the server. The screen needs to know
        # only whether one is stored, so it can say so and leave it alone.
        value = mail_settings.MASK if row.key in mail_settings.SECRET_KEYS else row.value
        grouped.setdefault(row.group, {})[row.key] = value

    cfg = mail_settings.resolve(db)
    grouped.setdefault(mail_settings.GROUP, {}).update({
        "mail.provider": cfg.provider,
        "mail.host": cfg.host,
        "mail.port": str(cfg.port),
        "mail.security": cfg.security,
        "mail.username": cfg.username,
        "mail.from_address": cfg.from_address,
        "mail.from_name": cfg.from_name,
        "mail.support_inbox": cfg.support_inbox,
        "mail.password": mail_settings.MASK if mail_settings.has_password(db) else "",
        "mail.password_set": "true" if mail_settings.has_password(db) else "false",
        "mail.graph_tenant_id": cfg.graph_tenant_id,
        "mail.graph_client_id": cfg.graph_client_id,
        "mail.graph_client_secret":
            mail_settings.MASK if mail_settings.has_graph_secret(db) else "",
        "mail.graph_client_secret_set":
            "true" if mail_settings.has_graph_secret(db) else "false",
    })
    return {"groups": grouped}


@router.put("/settings")
def update_settings(
    data: schemas.SettingsIn,
    user: User = Depends(require_admin),
    db: Session = Depends(get_db),
):
    # mail.* is handled apart: the password is encrypted, and a masked or empty
    # one means "keep what is stored" rather than "clear it".
    mail_values = {k: v for k, v in data.values.items() if k.startswith("mail.")}
    if mail_values:
        mail_settings.apply(db, mail_values, user_id=user.id)

    for key, value in data.values.items():
        if key.startswith("mail."):
            continue
        row = db.get(Setting, key)
        if row:
            row.value = value
            row.updated_by_id = user.id
        else:
            db.add(Setting(key=key, value=value, updated_by_id=user.id))
    # The password itself is never written to the audit trail, only its key.
    audit.record(db, action="settings_updated", actor=user, details={"keys": list(data.values)})
    db.commit()
    return {"ok": True}


@router.post("/settings/mail/test")
def send_test_mail(
    data: schemas.MailTestIn,
    user: User = Depends(require_admin),
    db: Session = Depends(get_db),
):
    """Send one message with the stored configuration and report what happened.

    Configuration that has never delivered anything is a guess, so the screen
    that edits it can prove it works before the council relies on it.
    """
    from ..services.notifications.providers import provider_for

    cfg = mail_settings.resolve(db)
    recipient = (data.to or cfg.support_inbox or "").strip()
    if not recipient:
        raise HTTPException(400, "יש להזין כתובת לשליחת הבדיקה")
    if cfg.provider == "log":
        raise HTTPException(
            400, "ספק הדואר מוגדר כ״יומן״ — יש לבחור SMTP או Microsoft Graph "
                 "ולשמור לפני בדיקה")

    result = provider_for("email", db).send(
        recipient,
        "בדיקת הגדרות דואר — מוקד שירות",
        "הודעת בדיקה ממוקד השירות.\n"
        "אם הגיעה, הגדרות הדואר תקינות והמערכת יכולה לשלוח אישורים והתראות.\n"
        f"\n—\n{cfg.from_name}",
    )
    audit.record(db, action="mail_test", actor=user,
                 details={"to": recipient, "ok": result.ok, "error": result.error})
    db.commit()
    if not result.ok:
        return {"ok": False, "error": result.error, "recipient": recipient}
    return {"ok": True, "recipient": recipient}


# --- knowledge base ---------------------------------------------------------

@router.get("/known-issues")
def list_known_issues(
    category_id: int | None = None,
    user: User = Depends(current_user),
    db: Session = Depends(get_db),
):
    query = db.query(KnownIssue).filter(KnownIssue.active.is_(True))
    if category_id:
        query = query.filter(KnownIssue.category_id == category_id)
    rows = query.order_by(KnownIssue.views.desc(), KnownIssue.id.desc()).all()
    return {"items": [S.known_issue(r) for r in rows]}


@router.post("/known-issues", status_code=201)
def create_known_issue(
    data: schemas.KnownIssueIn,
    user: User = Depends(require_admin),
    db: Session = Depends(get_db),
):
    row = KnownIssue(**data.model_dump())
    db.add(row)
    db.commit()
    db.refresh(row)
    return S.known_issue(row)
