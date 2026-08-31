/** Hebrew labels and chip tones for every enumerated value in the domain.
 *  Kept in one file so a new status is a single edit. */
import i18n from '../i18n';
import type {
  ApprovalStatus, Priority, Role, SlaState, SubtaskStatus, TicketStatus,
} from './types';

/** Reads a translated value at call time, so switching language re-renders
 *  correctly without every call site taking a hook. */
const tr = (key: string, fallback: string) => {
  const value = i18n.t(key);
  return value === key ? fallback : value;
};

export type Tone = 'neutral' | 'blue' | 'purple' | 'green' | 'amber' | 'red';

const statusLabelFallback: Record<string, string> = {
  new: 'חדש',
  assigned: 'הוקצה',
  viewed: 'נצפה',
  in_progress: 'בטיפול',
  resolved: 'נפתר',
  rejected: 'נדחה',
  reopened: 'נפתח מחדש',
};
export const statusLabel = new Proxy(statusLabelFallback, {
  get: (target, key: string) => tr(`status.${key}`, target[key] ?? key),
}) as Record<string, string>;

export const statusTone: Record<TicketStatus, Tone> = {
  new: 'neutral',
  assigned: 'blue',
  viewed: 'blue',
  in_progress: 'purple',
  resolved: 'green',
  rejected: 'red',
  reopened: 'amber',
};

const priorityLabelFallback: Record<string, string> = {
  low: 'נמוכה',
  normal: 'רגילה',
  high: 'גבוהה',
  urgent: 'דחופה',
};
export const priorityLabel = new Proxy(priorityLabelFallback, {
  get: (target, key: string) => tr(`priority.${key}`, target[key] ?? key),
}) as Record<string, string>;

export const priorityTone: Record<Priority, Tone> = {
  low: 'neutral',
  normal: 'blue',
  high: 'amber',
  urgent: 'red',
};

const slaLabelFallback: Record<string, string> = {
  ok: 'בזמן',
  at_risk: 'בסיכון',
  breached: 'חריגה',
  met: 'עמד ביעד',
  none: 'ללא יעד',
};
export const slaLabel = new Proxy(slaLabelFallback, {
  get: (target, key: string) => tr(`sla.${key}`, target[key] ?? key),
}) as Record<string, string>;

export const slaTone: Record<SlaState, Tone> = {
  ok: 'green',
  at_risk: 'amber',
  breached: 'red',
  met: 'green',
  none: 'neutral',
};

const roleLabelFallback: Record<string, string> = {
  requester: 'פונה',
  resolver: 'מטפל',
  approver: 'מאשר',
  admin: 'מנהל מערכת',
};
export const roleLabel = new Proxy(roleLabelFallback, {
  get: (target, key: string) => tr(`role.${key}`, target[key] ?? key),
}) as Record<string, string>;

export const roleTone: Record<Role, Tone> = {
  requester: 'neutral',
  resolver: 'blue',
  approver: 'amber',
  admin: 'purple',
};

const subtaskStatusLabelFallback: Record<string, string> = {
  open: 'פתוחה',
  in_progress: 'בביצוע',
  resolved: 'הושלמה',
  closed: 'נסגרה',
};
export const subtaskStatusLabel = new Proxy(subtaskStatusLabelFallback, {
  get: (target, key: string) => tr(`subtaskStatus.${key}`, target[key] ?? key),
}) as Record<string, string>;

export const subtaskStatusTone: Record<SubtaskStatus, Tone> = {
  open: 'neutral',
  in_progress: 'purple',
  resolved: 'green',
  closed: 'neutral',
};

const approvalStatusLabelFallback: Record<string, string> = {
  pending: 'ממתין',
  approved: 'אושר',
  rejected: 'נדחה',
  cancelled: 'בוטל',
};
export const approvalStatusLabel = new Proxy(approvalStatusLabelFallback, {
  get: (target, key: string) => tr(`approvalStatus.${key}`, target[key] ?? key),
}) as Record<string, string>;

export const approvalStatusTone: Record<ApprovalStatus, Tone> = {
  pending: 'amber',
  approved: 'green',
  rejected: 'red',
  cancelled: 'neutral',
};

const assigneeTypeLabelFallback: Record<string, string> = {
  internal: 'פנימי',
  external: 'חיצוני',
};
export const assigneeTypeLabel = new Proxy(assigneeTypeLabelFallback, {
  get: (target, key: string) => tr(`assigneeType.${key}`, target[key] ?? key),
}) as Record<string, string>;

const channelLabelFallback: Record<string, string> = {
  email: 'דוא״ל',
  sms: 'מסרון',
  whatsapp: 'וואטסאפ',
};
export const channelLabel = new Proxy(channelLabelFallback, {
  get: (target, key: string) => tr(`channel.${key}`, target[key] ?? key),
}) as Record<string, string>;

export const triggerLabel: Record<string, string> = {
  cost: 'חריגת עלות',
  hours: 'חריגת שעות',
  new_service: 'שירות חדש',
  manual: 'בקשה ידנית',
};

export const tokenStateLabel: Record<string, string> = {
  active: 'קישור פעיל',
  revoked: 'הקישור בוטל',
  consumed: 'הקישור הסתיים',
  none: 'לא הונפק קישור',
};

/** Human sentences for audit actions, so the timeline reads as prose. */
export const actionLabel: Record<string, string> = {
  ticket_created: 'פתח/ה את הקריאה',
  ticket_assigned: 'הקריאה הוקצתה',
  ticket_viewed: 'צפה/תה בקריאה לראשונה',
  ticket_in_progress: 'העביר/ה את הקריאה לטיפול',
  ticket_updated: 'עדכן/ה את פרטי הקריאה',
  ticket_transferred: 'העביר/ה את הקריאה',
  ticket_resolved: 'סימן/ה את הקריאה כנפתרה',
  ticket_rejected: 'דחה/תה את הקריאה',
  ticket_reopened: 'פתח/ה את הקריאה מחדש',
  comment_added: 'הוסיף/ה תגובה',
  attachment_added: 'צירף/ה קובץ',
  subtask_created: 'יצר/ה משימת משנה',
  subtask_status_changed: 'עדכן/ה סטטוס משימה',
  subtask_comment_added: 'הוסיף/ה תגובה למשימה',
  subtask_attachment_added: 'צירף/ה קובץ למשימה',
  approval_requested: 'נדרש אישור',
  approval_decision: 'התקבלה החלטת אישור',
  external_link_issued: 'הונפק קישור לגורם חיצוני',
  external_link_regenerated: 'הונפק קישור חדש',
  external_link_revoked: 'הקישור החיצוני בוטל',
  external_link_deactivated: 'הקישור החיצוני הפסיק לפעול',
  external_comment_added: 'הגורם החיצוני הוסיף תגובה',
  external_status_changed: 'הגורם החיצוני עדכן סטטוס',
  external_attachment_uploaded: 'הגורם החיצוני העלה קובץ',
  user_login: 'התחבר/ה למערכת',
  password_changed: 'החליף/ה סיסמה',
  password_reset: 'איפס/ה סיסמה',
  user_created: 'נוצר משתמש',
  user_updated: 'עודכן משתמש',
  category_created: 'נוצרה קטגוריה',
  category_updated: 'עודכנה קטגוריה',
  category_archived: 'קטגוריה הועברה לארכיון',
  category_deleted: 'קטגוריה נמחקה',
  workflow_rule_created: 'נוצר כלל תהליך',
  workflow_rule_updated: 'עודכן כלל תהליך',
  workflow_rule_deleted: 'נמחק כלל תהליך',
  settings_updated: 'עודכנו הגדרות',
  request_type_created: 'נוצר סוג בקשה',
  request_type_updated: 'עודכן סוג בקשה',
};

export const describeAction = (action: string) => actionLabel[action] ?? action;
