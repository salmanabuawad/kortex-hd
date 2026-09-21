"""Request bodies. Responses are shaped by app/api/serializers.py, which keeps
field-level authorization decisions in one reviewable place."""
from datetime import date

from pydantic import BaseModel, EmailStr, Field


class LoginIn(BaseModel):
    email: EmailStr
    password: str


class PasswordChange(BaseModel):
    current_password: str
    new_password: str


class PasswordReset(BaseModel):
    password: str


class TicketCreate(BaseModel):
    subject: str = Field(min_length=3, max_length=220)
    description: str = Field(min_length=1)
    category_id: int
    request_type_id: int | None = None
    priority: str | None = None
    estimated_cost: float | None = Field(default=None, ge=0)
    estimated_hours: float | None = Field(default=None, ge=0)


class TicketUpdate(BaseModel):
    priority: str | None = None
    estimated_cost: float | None = Field(default=None, ge=0)
    estimated_hours: float | None = Field(default=None, ge=0)
    subject: str | None = None


class TicketResolve(BaseModel):
    note: str = Field(min_length=1)


class TicketReject(BaseModel):
    note: str = Field(min_length=1)


class TicketReopen(BaseModel):
    reason: str = Field(min_length=1)


class TransferIn(BaseModel):
    resolver_id: int
    category_id: int | None = None
    reason: str = Field(min_length=1)


class CommentIn(BaseModel):
    body: str = Field(min_length=1)
    internal: bool = False


class SubtaskCreate(BaseModel):
    title: str = Field(min_length=2, max_length=220)
    description: str = ""
    assignee_type: str = "internal"
    assignee_user_id: int | None = None
    external_name: str | None = None
    external_org: str | None = None
    external_email: EmailStr | None = None
    external_phone: str | None = None
    external_channel: str | None = None
    due_date: date | None = None
    priority: str = "normal"


class SubtaskUpdate(BaseModel):
    status: str | None = None
    title: str | None = None
    description: str | None = None
    due_date: date | None = None
    priority: str | None = None


class GuestUpdate(BaseModel):
    comment: str | None = None
    status: str | None = None


class ApprovalRequestIn(BaseModel):
    reason: str = Field(min_length=1)
    approver_id: int | None = None


class ApprovalDecision(BaseModel):
    decision: str
    note: str | None = None


class CategoryIn(BaseModel):
    name: str = Field(min_length=2, max_length=120)
    description: str | None = None
    icon: str = "LifeBuoy"
    color: str = "blue"
    resolver_id: int | None = None
    backup_resolver_id: int | None = None
    escalation_id: int | None = None
    sla_hours: int | None = Field(default=None, ge=1)
    default_priority: str = "normal"
    approval_new_service: bool = False
    cost_threshold: float | None = Field(default=None, ge=0)
    hours_threshold: float | None = Field(default=None, ge=0)
    request_type_ids: list[int] = []
    active: bool = True


class UserIn(BaseModel):
    full_name: str = Field(min_length=2, max_length=120)
    email: EmailStr
    phone: str | None = None
    role: str = "requester"
    department_id: int | None = None
    title: str | None = None
    password: str
    active: bool = True


class UserUpdate(BaseModel):
    full_name: str | None = None
    #: Also the login, so changing it changes how the person signs in. Editable
    #: because the staff import generated addresses for employees who had none
    #: on file, and those have to be replaced with real mailboxes.
    email: EmailStr | None = None
    phone: str | None = None
    role: str | None = None
    department_id: int | None = None
    title: str | None = None
    active: bool | None = None


class RequestTypeIn(BaseModel):
    key: str = Field(min_length=2, max_length=40)
    name: str = Field(min_length=2, max_length=120)
    description: str | None = None
    icon: str | None = None
    requires_approval_default: bool = False
    active: bool = True
    sort_order: int = 0


class WorkflowRuleIn(BaseModel):
    name: str = Field(min_length=2, max_length=160)
    description: str | None = None
    active: bool = True
    category_id: int | None = None
    request_type_id: int | None = None
    cost_gt: float | None = Field(default=None, ge=0)
    hours_gt: float | None = Field(default=None, ge=0)
    approver_id: int | None = None
    sort_order: int = 0


class SettingsIn(BaseModel):
    values: dict[str, str | None]


class DepartmentIn(BaseModel):
    name: str = Field(min_length=2, max_length=120)
    active: bool = True


class KnownIssueIn(BaseModel):
    title: str = Field(min_length=2, max_length=220)
    summary: str = Field(min_length=1)
    resolution: str | None = None
    category_id: int | None = None
    active: bool = True


class FieldConfigIn(BaseModel):
    field_name: str = Field(min_length=1, max_length=60)
    label_he: str | None = None
    label_en: str | None = None
    label_ar: str | None = None
    width_chars: int = Field(default=14, ge=2, le=120)
    padding: int = Field(default=24, ge=0, le=120)
    visible: bool = True
    pinned: bool = False
    pin_side: str | None = None


class FieldConfigBulk(BaseModel):
    fields: list[FieldConfigIn]


class GridStateIn(BaseModel):
    state: list[dict] | dict


class PreferencesIn(BaseModel):
    language: str = "he"
    font_size: str = "normal"
    contrast: str = "normal"


class MailTestIn(BaseModel):
    """Where to send the configuration test. Defaults to the support inbox."""
    to: str | None = None
