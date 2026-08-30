"""Dashboard, analytics, and system health."""
from datetime import datetime, timedelta, timezone

from fastapi import APIRouter, Depends
from sqlalchemy import func
from sqlalchemy.orm import Session

from ..config import EMAIL_PROVIDER, SMS_PROVIDER, UPLOAD_DIR, WHATSAPP_PROVIDER
from ..constants import (
    ApprovalStatus, Role, SlaState, SubtaskStatus, TicketApprovalState, TicketStatus,
)
from ..db import get_db, engine
from ..models import (
    Approval, AuditEvent, Category, NotificationDelivery, Subtask, Ticket, User,
)
from ..services import sla
from .deps import current_user, require_admin, require_staff
from . import serializers as S

router = APIRouter(prefix="/api", tags=["insights"])


def _scope(db: Session, user: User):
    q = db.query(Ticket)
    if user.role == Role.REQUESTER:
        return q.filter(Ticket.requester_id == user.id)
    if user.role == Role.RESOLVER:
        return q.filter((Ticket.resolver_id == user.id) | (Ticket.requester_id == user.id))
    return q


@router.get("/dashboard")
def dashboard(
    user: User = Depends(current_user),
    db: Session = Depends(get_db),
):
    """Answers: what needs attention, what is overdue, what waits on approval."""
    scoped = _scope(db, user)
    all_rows = scoped.all()

    open_rows = [t for t in all_rows if t.status in TicketStatus.OPEN]
    states = {t.id: sla.state_for(t) for t in open_rows}
    overdue = [t for t in open_rows if states[t.id] == SlaState.BREACHED]
    at_risk = [t for t in open_rows if states[t.id] == SlaState.AT_RISK]
    waiting = [t for t in open_rows if t.approval_state == TicketApprovalState.PENDING]

    assigned_to_me = [
        t for t in open_rows
        if t.resolver_id == user.id and t.status in (TicketStatus.ASSIGNED, TicketStatus.NEW)
    ]

    by_status = {}
    for t in all_rows:
        by_status[t.status] = by_status.get(t.status, 0) + 1

    by_category: dict[str, int] = {}
    for t in open_rows:
        name = t.category.name if t.category else "—"
        by_category[name] = by_category.get(name, 0) + 1

    closed = [t for t in all_rows if t.status in TicketStatus.CLOSED and t.resolved_at]
    met = sum(1 for t in closed if sla.state_for(t) == SlaState.MET)
    sla_rate = round(met / len(closed) * 100) if closed else None

    recent = sorted(open_rows, key=lambda t: t.updated_at or t.created_at, reverse=True)[:8]

    approvals_waiting = []
    if user.role in Role.STAFF:
        q = db.query(Approval).filter(Approval.status == ApprovalStatus.PENDING)
        if user.role == Role.APPROVER:
            q = q.filter(Approval.approver_id == user.id)
        elif user.role == Role.RESOLVER:
            q = q.filter(Approval.approver_id == user.id)
        approvals_waiting = [S.approval(a) for a in q.order_by(Approval.requested_at).limit(5)]

    return {
        "kpis": {
            "open": len(open_rows),
            "assigned_to_me": len(assigned_to_me),
            "waiting_approval": len(waiting),
            "overdue": len(overdue),
            "at_risk": len(at_risk),
            "resolved_total": len([t for t in all_rows if t.status == TicketStatus.RESOLVED]),
        },
        "by_status": [{"status": k, "count": v} for k, v in by_status.items()],
        "by_category": sorted(
            [{"category": k, "count": v} for k, v in by_category.items()],
            key=lambda i: i["count"], reverse=True)[:6],
        "sla_rate": sla_rate,
        "recent": [S.ticket_row(t) for t in recent],
        "needs_attention": [S.ticket_row(t) for t in (overdue + at_risk)[:6]],
        "approvals": approvals_waiting,
    }


@router.get("/analytics")
def analytics(
    days: int = 30,
    category_id: int | None = None,
    resolver_id: int | None = None,
    user: User = Depends(require_staff),
    db: Session = Depends(get_db),
):
    since = datetime.now(timezone.utc) - timedelta(days=max(1, min(days, 365)))
    query = db.query(Ticket).filter(Ticket.created_at >= since)
    if category_id:
        query = query.filter(Ticket.category_id == category_id)
    if resolver_id:
        query = query.filter(Ticket.resolver_id == resolver_id)
    rows = query.all()

    volume: dict[str, int] = {}
    for t in rows:
        day = t.created_at.date().isoformat()
        volume[day] = volume.get(day, 0) + 1

    closed = [t for t in rows if t.resolved_at]
    durations = []
    for t in closed:
        created = t.created_at.replace(tzinfo=timezone.utc) if t.created_at.tzinfo is None else t.created_at
        resolved = t.resolved_at.replace(tzinfo=timezone.utc) if t.resolved_at.tzinfo is None else t.resolved_at
        durations.append((resolved - created).total_seconds() / 3600)
    avg_hours = round(sum(durations) / len(durations), 1) if durations else None

    met = sum(1 for t in closed if sla.state_for(t) == SlaState.MET)
    sla_rate = round(met / len(closed) * 100) if closed else None

    by_category: dict[str, int] = {}
    by_resolver: dict[str, int] = {}
    for t in rows:
        cname = t.category.name if t.category else "—"
        by_category[cname] = by_category.get(cname, 0) + 1
        rname = t.resolver.full_name if t.resolver else "לא הוקצה"
        by_resolver[rname] = by_resolver.get(rname, 0) + 1

    subtask_rows = (
        db.query(Subtask)
        .filter(Subtask.created_at >= since, Subtask.assignee_type == "external")
        .all()
    )
    external_done = [s for s in subtask_rows if s.resolved_at]

    approvals = db.query(Approval).filter(Approval.requested_at >= since).all()

    return {
        "range_days": days,
        "totals": {
            "created": len(rows),
            "closed": len(closed),
            "reopened": sum(1 for t in rows if t.reopen_count > 0),
            "avg_resolution_hours": avg_hours,
            "sla_rate": sla_rate,
        },
        "volume": [{"date": k, "count": v} for k, v in sorted(volume.items())],
        "by_category": sorted([{"label": k, "count": v} for k, v in by_category.items()],
                              key=lambda i: i["count"], reverse=True),
        "by_resolver": sorted([{"label": k, "count": v} for k, v in by_resolver.items()],
                              key=lambda i: i["count"], reverse=True)[:10],
        "approvals": {
            "total": len(approvals),
            "approved": sum(1 for a in approvals if a.status == ApprovalStatus.APPROVED),
            "rejected": sum(1 for a in approvals if a.status == ApprovalStatus.REJECTED),
            "pending": sum(1 for a in approvals if a.status == ApprovalStatus.PENDING),
        },
        "external_subtasks": {
            "total": len(subtask_rows),
            "resolved": len(external_done),
            "open": sum(1 for s in subtask_rows if s.status in SubtaskStatus.ACTIVE),
        },
    }


@router.get("/health")
def health():
    """Public liveness probe. Deliberately shallow: no internals leak here."""
    return {"status": "ok", "time": datetime.now(timezone.utc).isoformat()}


@router.get("/system/health")
def system_health(
    user: User = Depends(require_admin),
    db: Session = Depends(get_db),
):
    """Admin-only component health."""
    components = []

    try:
        db.execute(func.now().select() if False else __import__("sqlalchemy").text("SELECT 1"))
        components.append({"key": "database", "label": "מסד נתונים",
                           "state": "ok", "detail": engine.url.database or ""})
    except Exception as exc:                                  # noqa: BLE001
        components.append({"key": "database", "label": "מסד נתונים",
                           "state": "error", "detail": str(exc)[:200]})

    components.append({"key": "application", "label": "שרת היישום", "state": "ok",
                       "detail": "FastAPI פעיל"})

    from ..services.notifications.providers import provider_for
    for key, label, configured in (
        ("email", "דואר אלקטרוני", EMAIL_PROVIDER),
        ("sms", "מסרונים", SMS_PROVIDER),
        ("whatsapp", "וואטסאפ", WHATSAPP_PROVIDER),
    ):
        ok, detail = provider_for(key).healthy()
        components.append({
            "key": key, "label": label,
            "state": "ok" if ok else "error",
            "detail": f"{detail} ({configured})" if configured == "log" else detail,
            "degraded": configured == "log",
        })

    try:
        UPLOAD_DIR.mkdir(parents=True, exist_ok=True)
        probe = UPLOAD_DIR / ".healthcheck"
        probe.write_text("ok", encoding="utf-8")
        probe.unlink()
        total = sum(1 for _ in UPLOAD_DIR.rglob("*") if _.is_file())
        components.append({"key": "storage", "label": "אחסון קבצים", "state": "ok",
                           "detail": f"{total} קבצים"})
    except Exception as exc:                                  # noqa: BLE001
        components.append({"key": "storage", "label": "אחסון קבצים",
                           "state": "error", "detail": str(exc)[:200]})

    failed = db.query(NotificationDelivery).filter(
        NotificationDelivery.status == "failed").count()
    components.append({
        "key": "notifications", "label": "תור התראות",
        "state": "warning" if failed else "ok",
        "detail": f"{failed} מסירות נכשלו" if failed else "אין כשלים",
    })

    counts = {
        "users": db.query(User).count(),
        "tickets": db.query(Ticket).count(),
        "categories": db.query(Category).count(),
        "audit_events": db.query(AuditEvent).count(),
    }
    return {"components": components, "counts": counts,
            "generated_at": datetime.now(timezone.utc).isoformat()}


@router.get("/notifications/deliveries")
def deliveries(
    limit: int = 50,
    user: User = Depends(require_admin),
    db: Session = Depends(get_db),
):
    rows = (
        db.query(NotificationDelivery)
        .order_by(NotificationDelivery.id.desc())
        .limit(min(limit, 200))
        .all()
    )
    return {"items": [
        {
            "id": r.id, "channel": r.channel, "recipient": r.recipient,
            "subject": r.subject, "status": r.status, "provider": r.provider,
            "error": r.error,
            "created_at": r.created_at.isoformat() if r.created_at else None,
        }
        for r in rows
    ]}
