"""Hebrew notification copy, one entry per event key."""
from ...config import COUNCIL_NAME, PUBLIC_BASE_URL
from ...constants import Events

_SIGNATURE = f"\n\n—\n{COUNCIL_NAME} · מוקד שירות"

# The stored value is an English key; a message to a requester should not say
# "normal" in the middle of a Hebrew sentence.
_PRIORITIES = {"low": "נמוכה", "normal": "רגילה", "high": "גבוהה", "urgent": "דחופה"}


def _priority_label(value) -> str:
    return _PRIORITIES.get(str(value), str(value or ""))


def _ticket_line(ticket) -> str:
    if not ticket:
        return ""
    return f"קריאה {ticket.number}: {ticket.subject}"


_TEMPLATES = {
    Events.TICKET_CREATED: (
        "נפתחה קריאה חדשה {number}",
        "נפתחה קריאה חדשה ומחכה לטיפול.\n{ticket_line}\nקטגוריה: {category}\nפותח הקריאה: {requester}",
    ),
    Events.TICKET_CONFIRMED: (
        "הקריאה שלך נקלטה — {number}",
        "הפנייה שלך התקבלה במוקד השירות ומספרה {number}.\n"
        "{ticket_line}\n"
        "קטגוריה: {category}\n"
        "דחיפות: {priority}\n\n"
        "אפשר לעקוב אחר הטיפול בקריאה בכתובת:\n{ticket_url}\n\n"
        "לשאלות אפשר להשיב להודעה זו.",
    ),
    Events.TICKET_ASSIGNED: (
        "הוקצתה אליך קריאה {number}",
        "הקריאה הבאה הוקצתה לטיפולך.\n{ticket_line}\nדחיפות: {priority}",
    ),
    Events.TICKET_TRANSFERRED: (
        "קריאה {number} הועברה אליך",
        "קריאה הועברה לטיפולך.\n{ticket_line}\nסיבת ההעברה: {reason}",
    ),
    Events.TICKET_RESOLVED: (
        "קריאה {number} נפתרה",
        "הקריאה שלך טופלה.\n{ticket_line}\n{note}",
    ),
    Events.TICKET_REJECTED: (
        "קריאה {number} נדחתה",
        "הקריאה שלך נדחתה.\n{ticket_line}\n{note}",
    ),
    Events.TICKET_REOPENED: (
        "קריאה {number} נפתחה מחדש",
        "פותח הקריאה ביקש לפתוח אותה מחדש.\n{ticket_line}\nסיבה: {reason}",
    ),
    Events.COMMENT_ADDED: (
        "תגובה חדשה בקריאה {number}",
        "נוספה תגובה חדשה.\n{ticket_line}\n\n{body}",
    ),
    Events.APPROVAL_REQUESTED: (
        "בקשת אישור לקריאה {number}",
        "ממתינה לך בקשת אישור.\n{ticket_line}\nסיבה: {reason}",
    ),
    Events.APPROVAL_DECIDED: (
        "החלטת אישור לקריאה {number}",
        "בקשת האישור נענתה: {decision}.\n{ticket_line}\n{note}",
    ),
    Events.SUBTASK_ASSIGNED: (
        "הוקצתה אליך משימה {subtask_number}",
        "הוקצתה אליך משימת משנה.\n{subtask_title}\nשייכת ל{ticket_line}",
    ),
    Events.SUBTASK_LINK_SENT: (
        "משימה עבורך ממוקד השירות",
        "הוקצתה עבורך משימה.\n{subtask_title}\n\nלצפייה ולעדכון:\n{link}\n\n"
        "הקישור אישי ותקף עד לסיום המשימה.",
    ),
    Events.SUBTASK_UPDATED: (
        "עדכון במשימה {subtask_number}",
        "חל עדכון במשימת משנה.\n{subtask_title}\nסטטוס: {status}\n{body}",
    ),
    Events.SLA_WARNING: (
        "התראת זמן תקן לקריאה {number}",
        "הקריאה מתקרבת לחריגה מזמן התקן.\n{ticket_line}",
    ),
}

_FALLBACK = ("עדכון ממוקד השירות", "חל עדכון.\n{ticket_line}")


def render(event_key: str, *, ticket=None, subtask=None, context: dict | None = None):
    context = context or {}
    subject_tpl, body_tpl = _TEMPLATES.get(event_key, _FALLBACK)

    fields = {
        "number": ticket.number if ticket else "",
        "ticket_line": _ticket_line(ticket),
        "category": ticket.category.name if ticket and ticket.category else "",
        "requester": ticket.requester.full_name if ticket and ticket.requester else "",
        "priority": _priority_label(context.get("priority", ticket.priority if ticket else "")),
        "ticket_url": f"{PUBLIC_BASE_URL}/tickets/{ticket.id}" if ticket else PUBLIC_BASE_URL,
        "subtask_number": subtask.number if subtask else "",
        "subtask_title": subtask.title if subtask else "",
        "status": context.get("status", ""),
        "reason": context.get("reason", ""),
        "note": context.get("note", ""),
        "body": context.get("body", ""),
        "decision": context.get("decision", ""),
        "link": context.get("link", ""),
    }
    fields.update({k: v for k, v in context.items() if k not in fields or not fields[k]})

    def _fill(template: str) -> str:
        try:
            return template.format(**fields)
        except KeyError:
            return template

    return _fill(subject_tpl), _fill(body_tpl) + _SIGNATURE
