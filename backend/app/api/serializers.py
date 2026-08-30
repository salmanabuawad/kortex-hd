"""Response shaping.

Every field the API returns passes through here, so what a requester, a
resolver and an external guest can each see is decided in one file rather than
scattered across routes.
"""
from decimal import Decimal

from ..constants import Role
from ..services import sla


def _num(value):
    if value is None:
        return None
    return float(value) if isinstance(value, Decimal) else value


def _iso(value):
    return value.isoformat() if value else None


def user_brief(user) -> dict | None:
    if not user:
        return None
    return {
        "id": user.id,
        "name": user.full_name,
        "initials": user.initials,
        "role": user.role,
    }


def user_full(user) -> dict:
    return {
        "id": user.id,
        "full_name": user.full_name,
        "initials": user.initials,
        "email": user.email,
        "phone": user.phone,
        "role": user.role,
        "title": user.title,
        "department_id": user.department_id,
        "department": user.department.name if user.department else None,
        "active": user.active,
        "must_change_password": user.must_change_password,
        "last_login_at": _iso(user.last_login_at),
    }


def request_type(rt) -> dict | None:
    if not rt:
        return None
    return {
        "id": rt.id,
        "key": rt.key,
        "name": rt.name,
        "description": rt.description,
        "icon": rt.icon,
        "requires_approval_default": rt.requires_approval_default,
        "active": rt.active,
        "sort_order": rt.sort_order,
    }


def category(cat, *, admin: bool = False) -> dict:
    data = {
        "id": cat.id,
        "name": cat.name,
        "description": cat.description,
        "icon": cat.icon,
        "color": cat.color,
        "sla_hours": cat.sla_hours,
        "default_priority": cat.default_priority,
        "active": cat.active,
        "request_types": [request_type(rt) for rt in cat.request_types],
    }
    if admin:
        data.update({
            "resolver_id": cat.resolver_id,
            "resolver": user_brief(cat.resolver),
            "backup_resolver_id": cat.backup_resolver_id,
            "backup_resolver": user_brief(cat.backup_resolver),
            "escalation_id": cat.escalation_id,
            "escalation": user_brief(cat.escalation),
            "approval_new_service": cat.approval_new_service,
            "cost_threshold": _num(cat.cost_threshold),
            "hours_threshold": _num(cat.hours_threshold),
            "sort_order": cat.sort_order,
        })
    return data


def ticket_row(ticket) -> dict:
    """Compact shape for the ticket list."""
    return {
        "id": ticket.id,
        "number": ticket.number,
        "subject": ticket.subject,
        "status": ticket.status,
        "priority": ticket.priority,
        "approval_state": ticket.approval_state,
        "category": {
            "id": ticket.category.id,
            "name": ticket.category.name,
            "icon": ticket.category.icon,
            "color": ticket.category.color,
        } if ticket.category else None,
        "request_type": request_type(ticket.request_type),
        "requester": user_brief(ticket.requester),
        "resolver": user_brief(ticket.resolver),
        "sla_state": sla.state_for(ticket),
        "sla_due_at": _iso(ticket.sla_due_at),
        "sla_minutes_remaining": sla.minutes_remaining(ticket),
        "created_at": _iso(ticket.created_at),
        "updated_at": _iso(ticket.updated_at),
    }


def ticket_detail(ticket, *, viewer) -> dict:
    data = ticket_row(ticket)
    data.update({
        "description": ticket.description,
        "estimated_cost": _num(ticket.estimated_cost),
        "estimated_hours": _num(ticket.estimated_hours),
        "resolution_note": ticket.resolution_note,
        "reopen_count": ticket.reopen_count,
        "first_viewed_at": _iso(ticket.first_viewed_at),
        "resolved_at": _iso(ticket.resolved_at),
        "requester_detail": {
            "id": ticket.requester.id,
            "name": ticket.requester.full_name,
            "email": ticket.requester.email,
            "phone": ticket.requester.phone,
            "department": ticket.requester.department.name if ticket.requester.department else None,
            "title": ticket.requester.title,
        } if ticket.requester else None,
        "can_work": viewer.role == Role.ADMIN or (
            viewer.role == Role.RESOLVER and ticket.resolver_id == viewer.id),
        "is_requester": ticket.requester_id == viewer.id,
    })
    return data


def comment(row, *, include_internal: bool) -> dict | None:
    if row.internal and not include_internal:
        return None
    return {
        "id": row.id,
        "kind": "note" if row.internal else "message",
        "author": row.author_name,
        "author_id": row.author_id,
        "author_role": row.author.role if row.author else None,
        "initials": row.author.initials if row.author else row.author_name[:2],
        "body": row.body,
        "internal": row.internal,
        "created_at": _iso(row.created_at),
    }


def attachment(row) -> dict:
    return {
        "id": row.id,
        "filename": row.filename,
        "content_type": row.content_type,
        "size_bytes": row.size_bytes,
        "uploaded_by": getattr(row, "uploaded_by_name", None) or getattr(row, "uploaded_by", ""),
        "created_at": _iso(row.created_at),
    }


def audit_event(row) -> dict:
    return {
        "id": row.id,
        "kind": "event",
        "actor": row.actor_name,
        "actor_kind": row.actor_kind,
        "action": row.action,
        "details": row.details,
        "created_at": _iso(row.created_at),
    }


def subtask(row, *, token_state: dict | None = None) -> dict:
    data = {
        "id": row.id,
        "number": row.number,
        "ticket_id": row.ticket_id,
        "title": row.title,
        "description": row.description,
        "status": row.status,
        "priority": row.priority,
        "assignee_type": row.assignee_type,
        "assignee": user_brief(row.assignee),
        "external_name": row.external_name,
        "external_org": row.external_org,
        "external_email": row.external_email,
        "external_phone": row.external_phone,
        "external_channel": row.external_channel,
        "due_date": row.due_date.isoformat() if row.due_date else None,
        "created_at": _iso(row.created_at),
        "updated_at": _iso(row.updated_at),
        "resolved_at": _iso(row.resolved_at),
        "last_external_activity_at": _iso(row.last_external_activity_at),
    }
    if token_state is not None:
        data["token"] = token_state
    return data


def approval(row) -> dict:
    return {
        "id": row.id,
        "ticket_id": row.ticket_id,
        "ticket_number": row.ticket.number if row.ticket else None,
        "ticket_subject": row.ticket.subject if row.ticket else None,
        "ticket_priority": row.ticket.priority if row.ticket else None,
        "category": row.ticket.category.name if row.ticket and row.ticket.category else None,
        "reason": row.reason,
        "trigger": row.trigger,
        "amount": _num(row.amount),
        "hours": _num(row.hours),
        "status": row.status,
        "requested_by": user_brief(row.requested_by),
        "approver": user_brief(row.approver),
        "decision_note": row.decision_note,
        "requested_at": _iso(row.requested_at),
        "decided_at": _iso(row.decided_at),
    }


def workflow_rule(row) -> dict:
    return {
        "id": row.id,
        "name": row.name,
        "description": row.description,
        "active": row.active,
        "category_id": row.category_id,
        "category": row.category.name if row.category else None,
        "request_type_id": row.request_type_id,
        "request_type": row.request_type.name if row.request_type else None,
        "cost_gt": _num(row.cost_gt),
        "hours_gt": _num(row.hours_gt),
        "approver_id": row.approver_id,
        "approver": user_brief(row.approver),
        "sort_order": row.sort_order,
    }


def known_issue(row) -> dict:
    return {
        "id": row.id,
        "title": row.title,
        "summary": row.summary,
        "resolution": row.resolution,
        "category_id": row.category_id,
        "category": row.category.name if row.category else None,
        "active": row.active,
        "views": row.views,
    }


def guest_subtask(subtask_row, ticket, comments, attachments) -> dict:
    """The external guest view.

    Deliberately narrow: the parent ticket contributes only its number and
    subject, comments exclude anything internal, and attachments are only those
    explicitly shared. No approvals, no other subtasks, no directory, no costs.
    """
    return {
        "subtask": {
            "number": subtask_row.number,
            "title": subtask_row.title,
            "description": subtask_row.description,
            "status": subtask_row.status,
            "priority": subtask_row.priority,
            "due_date": subtask_row.due_date.isoformat() if subtask_row.due_date else None,
            "created_at": _iso(subtask_row.created_at),
        },
        "ticket": {"number": ticket.number, "subject": ticket.subject} if ticket else None,
        "assignee": {
            "name": subtask_row.external_name,
            "organization": subtask_row.external_org,
        },
        "comments": [
            {
                "author": c.author_name,
                "author_kind": c.author_kind,
                "body": c.body,
                "created_at": _iso(c.created_at),
            }
            for c in comments
        ],
        "attachments": [
            {
                "id": a.id,
                "filename": a.filename,
                "content_type": a.content_type,
                "size_bytes": a.size_bytes,
                "created_at": _iso(a.created_at),
            }
            for a in attachments
        ],
    }
