from pydantic import BaseModel, EmailStr

class LoginIn(BaseModel):
    email: EmailStr
    password: str

class TicketCreate(BaseModel):
    title: str
    description: str
    category_id: int
    request_type: str = "fault"
    priority: str = "normal"
    estimated_cost: float | None = None
    estimated_hours: float | None = None

class TicketUpdate(BaseModel):
    status: str | None = None
    priority: str | None = None
    estimated_cost: float | None = None
    estimated_hours: float | None = None

class ReassignIn(BaseModel):
    resolver_id: int
    category_id: int | None = None
    reason: str

class SubtaskCreate(BaseModel):
    title: str
    description: str = ""
    assignee_type: str = "internal"
    assignee_user_id: int | None = None
    external_name: str | None = None
    external_email: EmailStr | None = None
    external_phone: str | None = None
    delivery_channel: str | None = None

class CommentIn(BaseModel):
    body: str
    internal: bool = False

class GuestUpdate(BaseModel):
    status: str | None = None
    comment: str | None = None

class ApprovalDecision(BaseModel):
    decision: str
    note: str | None = None

class CategoryCreate(BaseModel):
    name: str
    description: str | None = None
    resolver_id: int | None = None
    escalation_id: int | None = None
    cost_threshold: float | None = None
    hours_threshold: float | None = None
    approval_new_service: bool = False
    active: bool = True

class UserCreate(BaseModel):
    name: str
    email: EmailStr
    phone: str | None = None
    role: str = "user"
    password: str

class PasswordReset(BaseModel):
    password: str

class PasswordChange(BaseModel):
    current_password: str
    new_password: str
