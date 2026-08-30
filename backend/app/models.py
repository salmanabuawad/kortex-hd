"""SQLAlchemy models. One module: the schema is cohesive and heavily
cross-referencing, so splitting it buys indirection rather than clarity."""
from datetime import date, datetime

from sqlalchemy import (
    Boolean, Date, DateTime, ForeignKey, Integer, Numeric, String, Text, func,
)
from sqlalchemy.orm import Mapped, mapped_column, relationship

from .constants import (
    ApprovalStatus, AssigneeType, Priority, Role, SubtaskStatus,
    TicketApprovalState, TicketStatus, TokenStatus,
)
from .db import Base


def _created() -> Mapped[datetime]:
    return mapped_column(DateTime(timezone=True), server_default=func.now(), nullable=False)


def _updated() -> Mapped[datetime]:
    return mapped_column(
        DateTime(timezone=True), server_default=func.now(), onupdate=func.now(), nullable=False)


class Department(Base):
    __tablename__ = "departments"
    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    name: Mapped[str] = mapped_column(String(120), unique=True)
    active: Mapped[bool] = mapped_column(Boolean, default=True, nullable=False)
    created_at: Mapped[datetime] = _created()


class User(Base):
    __tablename__ = "users"
    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    full_name: Mapped[str] = mapped_column(String(120))
    email: Mapped[str] = mapped_column(String(190), unique=True, index=True)
    phone: Mapped[str | None] = mapped_column(String(40))
    password_hash: Mapped[str] = mapped_column(String(255))
    role: Mapped[str] = mapped_column(String(30), default=Role.REQUESTER, nullable=False, index=True)
    department_id: Mapped[int | None] = mapped_column(ForeignKey("departments.id"))
    title: Mapped[str | None] = mapped_column(String(120))
    active: Mapped[bool] = mapped_column(Boolean, default=True, nullable=False)
    must_change_password: Mapped[bool] = mapped_column(Boolean, default=True, nullable=False)
    last_login_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    created_at: Mapped[datetime] = _created()
    updated_at: Mapped[datetime] = _updated()

    department = relationship("Department", lazy="joined")

    @property
    def initials(self) -> str:
        parts = [p for p in self.full_name.split() if p]
        return "".join(p[0] for p in parts[:2]) or self.full_name[:2]


class RequestType(Base):
    """Admin-manageable ticket types: fault, new service, and whatever else
    the council later needs."""
    __tablename__ = "request_types"
    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    key: Mapped[str] = mapped_column(String(40), unique=True)
    name: Mapped[str] = mapped_column(String(120))
    description: Mapped[str | None] = mapped_column(Text)
    icon: Mapped[str | None] = mapped_column(String(40))
    requires_approval_default: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)
    active: Mapped[bool] = mapped_column(Boolean, default=True, nullable=False)
    sort_order: Mapped[int] = mapped_column(Integer, default=0, nullable=False)


class Category(Base):
    __tablename__ = "categories"
    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    name: Mapped[str] = mapped_column(String(120), unique=True)
    description: Mapped[str | None] = mapped_column(Text)
    icon: Mapped[str] = mapped_column(String(40), default="LifeBuoy", nullable=False)
    color: Mapped[str] = mapped_column(String(20), default="blue", nullable=False)

    resolver_id: Mapped[int | None] = mapped_column(ForeignKey("users.id"))
    backup_resolver_id: Mapped[int | None] = mapped_column(ForeignKey("users.id"))
    escalation_id: Mapped[int | None] = mapped_column(ForeignKey("users.id"))

    sla_hours: Mapped[int | None] = mapped_column(Integer)
    default_priority: Mapped[str] = mapped_column(String(20), default=Priority.NORMAL, nullable=False)

    approval_new_service: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)
    cost_threshold: Mapped[float | None] = mapped_column(Numeric(12, 2))
    hours_threshold: Mapped[float | None] = mapped_column(Numeric(8, 2))

    active: Mapped[bool] = mapped_column(Boolean, default=True, nullable=False)
    sort_order: Mapped[int] = mapped_column(Integer, default=0, nullable=False)
    created_at: Mapped[datetime] = _created()

    resolver = relationship("User", foreign_keys=[resolver_id], lazy="joined")
    backup_resolver = relationship("User", foreign_keys=[backup_resolver_id], lazy="joined")
    escalation = relationship("User", foreign_keys=[escalation_id], lazy="joined")
    request_types = relationship(
        "RequestType", secondary="category_request_types", lazy="selectin",
        order_by="RequestType.sort_order")


class CategoryRequestType(Base):
    __tablename__ = "category_request_types"
    category_id: Mapped[int] = mapped_column(
        ForeignKey("categories.id", ondelete="CASCADE"), primary_key=True)
    request_type_id: Mapped[int] = mapped_column(
        ForeignKey("request_types.id", ondelete="CASCADE"), primary_key=True)


class Ticket(Base):
    __tablename__ = "tickets"
    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    number: Mapped[str] = mapped_column(String(30), unique=True, index=True)
    subject: Mapped[str] = mapped_column(String(220))
    description: Mapped[str] = mapped_column(Text)

    category_id: Mapped[int] = mapped_column(ForeignKey("categories.id"), index=True)
    request_type_id: Mapped[int | None] = mapped_column(ForeignKey("request_types.id"))
    requester_id: Mapped[int] = mapped_column(ForeignKey("users.id"), index=True)
    resolver_id: Mapped[int | None] = mapped_column(ForeignKey("users.id"), index=True)

    priority: Mapped[str] = mapped_column(String(20), default=Priority.NORMAL, nullable=False)
    status: Mapped[str] = mapped_column(
        String(30), default=TicketStatus.NEW, nullable=False, index=True)

    estimated_cost: Mapped[float | None] = mapped_column(Numeric(12, 2))
    estimated_hours: Mapped[float | None] = mapped_column(Numeric(8, 2))
    approval_state: Mapped[str] = mapped_column(
        String(20), default=TicketApprovalState.NONE, nullable=False)

    sla_due_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    first_viewed_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    resolved_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    resolution_note: Mapped[str | None] = mapped_column(Text)
    reopen_count: Mapped[int] = mapped_column(Integer, default=0, nullable=False)

    created_at: Mapped[datetime] = _created()
    updated_at: Mapped[datetime] = _updated()

    category = relationship("Category", lazy="joined")
    request_type = relationship("RequestType", lazy="joined")
    requester = relationship("User", foreign_keys=[requester_id], lazy="joined")
    resolver = relationship("User", foreign_keys=[resolver_id], lazy="joined")


class TicketAssignment(Base):
    """Append-only record of every assignment and transfer."""
    __tablename__ = "ticket_assignments"
    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    ticket_id: Mapped[int] = mapped_column(ForeignKey("tickets.id", ondelete="CASCADE"), index=True)
    from_user_id: Mapped[int | None] = mapped_column(ForeignKey("users.id"))
    to_user_id: Mapped[int | None] = mapped_column(ForeignKey("users.id"))
    from_category_id: Mapped[int | None] = mapped_column(ForeignKey("categories.id"))
    to_category_id: Mapped[int | None] = mapped_column(ForeignKey("categories.id"))
    reason: Mapped[str | None] = mapped_column(Text)
    actor_id: Mapped[int | None] = mapped_column(ForeignKey("users.id"))
    created_at: Mapped[datetime] = _created()


class TicketComment(Base):
    __tablename__ = "ticket_comments"
    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    ticket_id: Mapped[int] = mapped_column(ForeignKey("tickets.id", ondelete="CASCADE"), index=True)
    author_id: Mapped[int | None] = mapped_column(ForeignKey("users.id"))
    author_name: Mapped[str] = mapped_column(String(120))
    body: Mapped[str] = mapped_column(Text)
    internal: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)
    created_at: Mapped[datetime] = _created()

    author = relationship("User", lazy="joined")


class TicketAttachment(Base):
    __tablename__ = "ticket_attachments"
    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    ticket_id: Mapped[int] = mapped_column(ForeignKey("tickets.id", ondelete="CASCADE"), index=True)
    filename: Mapped[str] = mapped_column(String(255))
    stored_name: Mapped[str] = mapped_column(String(255), unique=True)
    content_type: Mapped[str] = mapped_column(String(120))
    size_bytes: Mapped[int] = mapped_column(Integer)
    uploaded_by_id: Mapped[int | None] = mapped_column(ForeignKey("users.id"))
    uploaded_by_name: Mapped[str] = mapped_column(String(120))
    created_at: Mapped[datetime] = _created()


class Subtask(Base):
    __tablename__ = "subtasks"
    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    number: Mapped[str] = mapped_column(String(40), unique=True, index=True)
    ticket_id: Mapped[int] = mapped_column(ForeignKey("tickets.id", ondelete="CASCADE"), index=True)
    title: Mapped[str] = mapped_column(String(220))
    description: Mapped[str] = mapped_column(Text, default="", nullable=False)

    assignee_type: Mapped[str] = mapped_column(
        String(20), default=AssigneeType.INTERNAL, nullable=False)
    assignee_user_id: Mapped[int | None] = mapped_column(ForeignKey("users.id"))
    external_name: Mapped[str | None] = mapped_column(String(120))
    external_org: Mapped[str | None] = mapped_column(String(160))
    external_email: Mapped[str | None] = mapped_column(String(190))
    external_phone: Mapped[str | None] = mapped_column(String(40))
    external_channel: Mapped[str | None] = mapped_column(String(20))

    due_date: Mapped[date | None] = mapped_column(Date)
    priority: Mapped[str] = mapped_column(String(20), default=Priority.NORMAL, nullable=False)
    status: Mapped[str] = mapped_column(
        String(30), default=SubtaskStatus.OPEN, nullable=False, index=True)

    created_by_id: Mapped[int | None] = mapped_column(ForeignKey("users.id"))
    created_at: Mapped[datetime] = _created()
    updated_at: Mapped[datetime] = _updated()
    resolved_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    last_external_activity_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))

    assignee = relationship("User", foreign_keys=[assignee_user_id], lazy="joined")
    ticket = relationship("Ticket", lazy="joined")


class SubtaskComment(Base):
    __tablename__ = "subtask_comments"
    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    subtask_id: Mapped[int] = mapped_column(ForeignKey("subtasks.id", ondelete="CASCADE"), index=True)
    author_user_id: Mapped[int | None] = mapped_column(ForeignKey("users.id"))
    author_name: Mapped[str] = mapped_column(String(120))
    author_kind: Mapped[str] = mapped_column(String(20), default="user", nullable=False)
    body: Mapped[str] = mapped_column(Text)
    internal: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)
    created_at: Mapped[datetime] = _created()


class SubtaskAttachment(Base):
    __tablename__ = "subtask_attachments"
    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    subtask_id: Mapped[int] = mapped_column(ForeignKey("subtasks.id", ondelete="CASCADE"), index=True)
    filename: Mapped[str] = mapped_column(String(255))
    stored_name: Mapped[str] = mapped_column(String(255), unique=True)
    content_type: Mapped[str] = mapped_column(String(120))
    size_bytes: Mapped[int] = mapped_column(Integer)
    uploaded_by: Mapped[str] = mapped_column(String(120))
    # Files the resolver deliberately shares down to the external assignee.
    shared_with_external: Mapped[bool] = mapped_column(Boolean, default=True, nullable=False)
    created_at: Mapped[datetime] = _created()


class ExternalAccessToken(Base):
    """Guest access to exactly one subtask. Only the digest is stored, so a
    database leak does not hand out working links."""
    __tablename__ = "external_access_tokens"
    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    subtask_id: Mapped[int] = mapped_column(ForeignKey("subtasks.id", ondelete="CASCADE"), index=True)
    token_hash: Mapped[str] = mapped_column(String(64), unique=True, index=True)
    prefix: Mapped[str] = mapped_column(String(12))
    status: Mapped[str] = mapped_column(String(20), default=TokenStatus.ACTIVE, nullable=False)
    issued_by_id: Mapped[int | None] = mapped_column(ForeignKey("users.id"))
    issued_at: Mapped[datetime] = _created()
    last_used_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    revoked_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    expires_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))


class Approval(Base):
    __tablename__ = "approvals"
    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    ticket_id: Mapped[int] = mapped_column(ForeignKey("tickets.id", ondelete="CASCADE"), index=True)
    reason: Mapped[str] = mapped_column(Text)
    trigger: Mapped[str] = mapped_column(String(30))
    amount: Mapped[float | None] = mapped_column(Numeric(12, 2))
    hours: Mapped[float | None] = mapped_column(Numeric(8, 2))
    requested_by_id: Mapped[int | None] = mapped_column(ForeignKey("users.id"))
    approver_id: Mapped[int | None] = mapped_column(ForeignKey("users.id"), index=True)
    status: Mapped[str] = mapped_column(
        String(20), default=ApprovalStatus.PENDING, nullable=False, index=True)
    decision_note: Mapped[str | None] = mapped_column(Text)
    requested_at: Mapped[datetime] = _created()
    decided_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))

    ticket = relationship("Ticket", lazy="joined")
    approver = relationship("User", foreign_keys=[approver_id], lazy="joined")
    requested_by = relationship("User", foreign_keys=[requested_by_id], lazy="joined")


class WorkflowRule(Base):
    """WHEN category / request type / cost / hours THEN require approval."""
    __tablename__ = "workflow_rules"
    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    name: Mapped[str] = mapped_column(String(160))
    description: Mapped[str | None] = mapped_column(Text)
    active: Mapped[bool] = mapped_column(Boolean, default=True, nullable=False)
    category_id: Mapped[int | None] = mapped_column(ForeignKey("categories.id", ondelete="CASCADE"))
    request_type_id: Mapped[int | None] = mapped_column(
        ForeignKey("request_types.id", ondelete="CASCADE"))
    cost_gt: Mapped[float | None] = mapped_column(Numeric(12, 2))
    hours_gt: Mapped[float | None] = mapped_column(Numeric(8, 2))
    approver_id: Mapped[int | None] = mapped_column(ForeignKey("users.id"))
    sort_order: Mapped[int] = mapped_column(Integer, default=0, nullable=False)
    created_at: Mapped[datetime] = _created()

    category = relationship("Category", lazy="joined")
    request_type = relationship("RequestType", lazy="joined")
    approver = relationship("User", lazy="joined")


class NotificationEvent(Base):
    __tablename__ = "notification_events"
    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    event_key: Mapped[str] = mapped_column(String(60), index=True)
    ticket_id: Mapped[int | None] = mapped_column(ForeignKey("tickets.id", ondelete="CASCADE"))
    subtask_id: Mapped[int | None] = mapped_column(ForeignKey("subtasks.id", ondelete="CASCADE"))
    payload: Mapped[str | None] = mapped_column(Text)
    created_at: Mapped[datetime] = _created()


class NotificationDelivery(Base):
    __tablename__ = "notification_deliveries"
    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    event_id: Mapped[int] = mapped_column(
        ForeignKey("notification_events.id", ondelete="CASCADE"), index=True)
    channel: Mapped[str] = mapped_column(String(20))
    recipient: Mapped[str] = mapped_column(String(190))
    subject: Mapped[str | None] = mapped_column(String(255))
    body: Mapped[str | None] = mapped_column(Text)
    status: Mapped[str] = mapped_column(String(20), default="pending", nullable=False, index=True)
    provider: Mapped[str | None] = mapped_column(String(60))
    error: Mapped[str | None] = mapped_column(Text)
    attempts: Mapped[int] = mapped_column(Integer, default=0, nullable=False)
    created_at: Mapped[datetime] = _created()
    sent_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))


class Setting(Base):
    __tablename__ = "settings"
    key: Mapped[str] = mapped_column(String(80), primary_key=True)
    value: Mapped[str | None] = mapped_column(Text)
    group: Mapped[str] = mapped_column(String(40), default="general", nullable=False)
    updated_at: Mapped[datetime] = _updated()
    updated_by_id: Mapped[int | None] = mapped_column(ForeignKey("users.id"))


class AuditEvent(Base):
    __tablename__ = "audit_events"
    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    ticket_id: Mapped[int | None] = mapped_column(
        ForeignKey("tickets.id", ondelete="CASCADE"), index=True)
    subtask_id: Mapped[int | None] = mapped_column(ForeignKey("subtasks.id", ondelete="CASCADE"))
    actor_kind: Mapped[str] = mapped_column(String(20), default="user", nullable=False)
    actor_id: Mapped[int | None] = mapped_column(ForeignKey("users.id"))
    actor_name: Mapped[str] = mapped_column(String(120))
    action: Mapped[str] = mapped_column(String(60), index=True)
    details: Mapped[str | None] = mapped_column(Text)
    created_at: Mapped[datetime] = _created()


class KnownIssue(Base):
    """Knowledge base entries, surfaced as hints while a ticket is drafted."""
    __tablename__ = "known_issues"
    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    category_id: Mapped[int | None] = mapped_column(ForeignKey("categories.id", ondelete="SET NULL"))
    title: Mapped[str] = mapped_column(String(220))
    summary: Mapped[str] = mapped_column(Text)
    resolution: Mapped[str | None] = mapped_column(Text)
    active: Mapped[bool] = mapped_column(Boolean, default=True, nullable=False)
    views: Mapped[int] = mapped_column(Integer, default=0, nullable=False)
    created_at: Mapped[datetime] = _created()

    category = relationship("Category", lazy="joined")
