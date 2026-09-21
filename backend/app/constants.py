"""Domain vocabulary. Kept as constants rather than DB enums so that adding a
value is a migration of data, not of type definitions."""

class Role:
    REQUESTER = "requester"
    RESOLVER = "resolver"
    APPROVER = "approver"
    ADMIN = "admin"
    ALL = {REQUESTER, RESOLVER, APPROVER, ADMIN}
    STAFF = {RESOLVER, APPROVER, ADMIN}          # sees the service-desk shell
    OPERATIONAL = {RESOLVER, ADMIN}              # may work tickets


class TicketStatus:
    NEW = "new"
    ASSIGNED = "assigned"
    VIEWED = "viewed"
    IN_PROGRESS = "in_progress"
    RESOLVED = "resolved"
    REJECTED = "rejected"
    REOPENED = "reopened"
    ALL = [NEW, ASSIGNED, VIEWED, IN_PROGRESS, RESOLVED, REJECTED, REOPENED]
    OPEN = {NEW, ASSIGNED, VIEWED, IN_PROGRESS, REOPENED}
    CLOSED = {RESOLVED, REJECTED}
    # The rail drawn on the ticket page; REOPENED folds back onto IN_PROGRESS.
    RAIL = [NEW, ASSIGNED, VIEWED, IN_PROGRESS, RESOLVED]


class Priority:
    LOW = "low"
    NORMAL = "normal"
    HIGH = "high"
    URGENT = "urgent"
    ALL = [LOW, NORMAL, HIGH, URGENT]


class SubtaskStatus:
    OPEN = "open"
    IN_PROGRESS = "in_progress"
    RESOLVED = "resolved"
    CLOSED = "closed"
    ALL = [OPEN, IN_PROGRESS, RESOLVED, CLOSED]
    ACTIVE = {OPEN, IN_PROGRESS}          # token stays valid only in these


class ApprovalStatus:
    PENDING = "pending"
    APPROVED = "approved"
    REJECTED = "rejected"
    CANCELLED = "cancelled"
    ALL = [PENDING, APPROVED, REJECTED, CANCELLED]


class ApprovalTrigger:
    NEW_SERVICE = "new_service"
    COST = "cost"
    HOURS = "hours"
    MANUAL = "manual"


class TicketApprovalState:
    NONE = "none"
    PENDING = "pending"
    APPROVED = "approved"
    REJECTED = "rejected"


class AssigneeType:
    INTERNAL = "internal"
    EXTERNAL = "external"


class Channel:
    EMAIL = "email"
    SMS = "sms"
    WHATSAPP = "whatsapp"
    ALL = [EMAIL, SMS, WHATSAPP]


class TokenStatus:
    ACTIVE = "active"
    REVOKED = "revoked"
    CONSUMED = "consumed"      # subtask resolved/closed


class ActorKind:
    USER = "user"
    EXTERNAL = "external"
    SYSTEM = "system"


class SlaState:
    OK = "ok"
    AT_RISK = "at_risk"
    BREACHED = "breached"
    MET = "met"
    NONE = "none"


class Events:
    """Notification event keys. Adapters subscribe to these, domain code emits them."""
    TICKET_CREATED = "ticket.created"
    TICKET_CONFIRMED = "ticket.confirmed"
    TICKET_ASSIGNED = "ticket.assigned"
    TICKET_TRANSFERRED = "ticket.transferred"
    TICKET_RESOLVED = "ticket.resolved"
    TICKET_REJECTED = "ticket.rejected"
    TICKET_REOPENED = "ticket.reopened"
    COMMENT_ADDED = "comment.added"
    APPROVAL_REQUESTED = "approval.requested"
    APPROVAL_DECIDED = "approval.decided"
    SUBTASK_ASSIGNED = "subtask.assigned"
    SUBTASK_LINK_SENT = "subtask.link_sent"
    SUBTASK_UPDATED = "subtask.updated"
    SLA_WARNING = "sla.warning"
