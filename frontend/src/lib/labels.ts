/** Hebrew labels and chip tones for every enumerated value in the domain.
 *  Kept in one file so a new status is a single edit. */
import type {
  ApprovalStatus, AssigneeType, Channel, Priority, Role, SlaState, SubtaskStatus, TicketStatus,
} from './types';

export type Tone = 'neutral' | 'blue' | 'purple' | 'green' | 'amber' | 'red';

export const statusLabel: Record<TicketStatus, string> = {
  new: 'חדש',
  assigned: 'הוקצה',
  viewed: 'נצפה',
  in_progress: 'בטיפול',
  resolved: 'נפתר',
  rejected: 'נדחה',
  reopened: 'נפתח מחדש',
};

export const statusTone: Record<TicketStatus, Tone> = {
  new: 'neutral',
  assigned: 'blue',
  viewed: 'blue',
  in_progress: 'purple',
  resolved: 'green',
  rejected: 'red',
  reopened: 'amber',
};

export const priorityLabel: Record<Priority, string> = {
  low: 'נמוכה',
  normal: 'רגילה',
  high: 'גבוהה',
  urgent: 'דחופה',
};

export const priorityTone: Record<Priority, Tone> = {
  low: 'neutral',
  normal: 'blue',
  high: 'amber',
  urgent: 'red',
};

export const slaLabel: Record<SlaState, string> = {
  ok: 'בזמן',
  at_risk: 'בסיכון',
  breached: 'חריגה',
  met: 'עמד ביעד',
  none: 'ללא יעד',
};

export const slaTone: Record<SlaState, Tone> = {
  ok: 'green',
  at_risk: 'amber',
  breached: 'red',
  met: 'green',
  none: 'neutral',
};

export const roleLabel: Record<Role, string> = {
  requester: 'פונה',
  resolver: 'מטפל',
  approver: 'מאשר',
  admin: 'מנהל מערכת',
};

export const roleTone: Record<Role, Tone> = {
  requester: 'neutral',
  resolver: 'blue',
  approver: 'amber',
  admin: 'purple',
};

export const subtaskStatusLabel: Record<SubtaskStatus, string> = {
  open: 'פתוחה',
  in_progress: 'בביצוע',
  resolved: 'הושלמה',
  closed: 'נסגרה',
};

export const subtaskStatusTone: Record<SubtaskStatus, Tone> = {
  open: 'neutral',
  in_progress: 'purple',
  resolved: 'green',
  closed: 'neutral',
};

export const approvalStatusLabel: Record<ApprovalStatus, string> = {
  pending: 'ממתין',
  approved: 'אושר',
  rejected: 'נדחה',
  cancelled: 'בוטל',
};

export const approvalStatusTone: Record<ApprovalStatus, Tone> = {
  pending: 'amber',
  approved: 'green',
  rejected: 'red',
  cancelled: 'neutral',
};

export const assigneeTypeLabel: Record<AssigneeType, string> = {
  internal: 'פנימי',
  external: 'חיצוני',
};

export const channelLabel: Record<Channel, string> = {
  email: 'דוא״ל',
  sms: 'מסרון',
  whatsapp: 'וואטסאפ',
};

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
