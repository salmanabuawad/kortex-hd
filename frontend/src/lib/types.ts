export type Role = 'requester' | 'resolver' | 'approver' | 'admin';

export type TicketStatus =
  | 'new' | 'assigned' | 'viewed' | 'in_progress' | 'resolved' | 'rejected' | 'reopened';

export type Priority = 'low' | 'normal' | 'high' | 'urgent';
export type SlaState = 'ok' | 'at_risk' | 'breached' | 'met' | 'none';
export type ApprovalState = 'none' | 'pending' | 'approved' | 'rejected';
export type ApprovalStatus = 'pending' | 'approved' | 'rejected' | 'cancelled';
export type SubtaskStatus = 'open' | 'in_progress' | 'resolved' | 'closed';
export type AssigneeType = 'internal' | 'external';
export type Channel = 'email' | 'sms' | 'whatsapp';

export interface UserBrief {
  id: number;
  name: string;
  initials: string;
  role: Role;
}

export interface User {
  id: number;
  full_name: string;
  initials: string;
  email: string;
  phone: string | null;
  role: Role;
  title: string | null;
  department_id: number | null;
  department: string | null;
  active: boolean;
  must_change_password: boolean;
  last_login_at: string | null;
}

export interface RequestType {
  id: number;
  key: string;
  name: string;
  description: string | null;
  icon: string | null;
  requires_approval_default: boolean;
  active: boolean;
  sort_order: number;
}

export interface Category {
  id: number;
  name: string;
  description: string | null;
  icon: string;
  color: string;
  sla_hours: number | null;
  default_priority: Priority;
  active: boolean;
  request_types: RequestType[];
  // admin-only fields
  resolver_id?: number | null;
  resolver?: UserBrief | null;
  backup_resolver_id?: number | null;
  backup_resolver?: UserBrief | null;
  escalation_id?: number | null;
  escalation?: UserBrief | null;
  approval_new_service?: boolean;
  cost_threshold?: number | null;
  hours_threshold?: number | null;
  sort_order?: number;
}

export interface TicketRow {
  id: number;
  number: string;
  subject: string;
  status: TicketStatus;
  priority: Priority;
  approval_state: ApprovalState;
  category: { id: number; name: string; icon: string; color: string } | null;
  request_type: RequestType | null;
  requester: UserBrief | null;
  resolver: UserBrief | null;
  sla_state: SlaState;
  sla_due_at: string | null;
  sla_minutes_remaining: number | null;
  created_at: string;
  updated_at: string;
}

export interface Ticket extends TicketRow {
  description: string;
  estimated_cost: number | null;
  estimated_hours: number | null;
  resolution_note: string | null;
  reopen_count: number;
  first_viewed_at: string | null;
  resolved_at: string | null;
  requester_detail: {
    id: number; name: string; email: string; phone: string | null;
    department: string | null; title: string | null;
  } | null;
  can_work: boolean;
  is_requester: boolean;
}

export interface ActivityItem {
  id: number;
  kind: 'message' | 'note' | 'event';
  author?: string;
  author_id?: number | null;
  author_role?: Role | null;
  initials?: string;
  body?: string;
  internal?: boolean;
  actor?: string;
  actor_kind?: string;
  action?: string;
  details?: string | null;
  created_at: string;
}

export interface Attachment {
  id: number;
  filename: string;
  content_type: string;
  size_bytes: number;
  uploaded_by: string;
  created_at: string;
}

export interface TokenState {
  state: 'active' | 'revoked' | 'consumed' | 'none';
  prefix: string | null;
  issued_at: string | null;
  last_used_at: string | null;
}

export interface Subtask {
  id: number;
  number: string;
  ticket_id: number;
  title: string;
  description: string;
  status: SubtaskStatus;
  priority: Priority;
  assignee_type: AssigneeType;
  assignee: UserBrief | null;
  external_name: string | null;
  external_org: string | null;
  external_email: string | null;
  external_phone: string | null;
  external_channel: Channel | null;
  due_date: string | null;
  created_at: string;
  updated_at: string;
  resolved_at: string | null;
  last_external_activity_at: string | null;
  token?: TokenState;
  guest_link?: string | null;
  comments?: SubtaskComment[];
  attachments?: Attachment[];
}

export interface SubtaskComment {
  id: number;
  author: string;
  author_kind: string;
  body: string;
  internal: boolean;
  created_at: string;
}

export interface Approval {
  id: number;
  ticket_id: number;
  ticket_number: string | null;
  ticket_subject: string | null;
  ticket_priority: Priority | null;
  category: string | null;
  reason: string;
  trigger: string;
  amount: number | null;
  hours: number | null;
  status: ApprovalStatus;
  requested_by: UserBrief | null;
  approver: UserBrief | null;
  decision_note: string | null;
  requested_at: string;
  decided_at: string | null;
}

export interface WorkflowRule {
  id: number;
  name: string;
  description: string | null;
  active: boolean;
  category_id: number | null;
  category: string | null;
  request_type_id: number | null;
  request_type: string | null;
  cost_gt: number | null;
  hours_gt: number | null;
  approver_id: number | null;
  approver: UserBrief | null;
  sort_order: number;
}

export interface KnownIssue {
  id: number;
  title: string;
  summary: string;
  resolution: string | null;
  category_id: number | null;
  category: string | null;
  active: boolean;
  views: number;
}

export interface Department { id: number; name: string; active: boolean }

export interface DashboardData {
  kpis: {
    open: number; assigned_to_me: number; waiting_approval: number;
    overdue: number; at_risk: number; resolved_total: number;
  };
  by_status: { status: TicketStatus; count: number }[];
  by_category: { category: string; count: number }[];
  sla_rate: number | null;
  recent: TicketRow[];
  needs_attention: TicketRow[];
  approvals: Approval[];
}

export interface AnalyticsData {
  range_days: number;
  totals: {
    created: number; closed: number; reopened: number;
    avg_resolution_hours: number | null; sla_rate: number | null;
  };
  volume: { date: string; count: number }[];
  by_category: { label: string; count: number }[];
  by_resolver: { label: string; count: number }[];
  approvals: { total: number; approved: number; rejected: number; pending: number };
  external_subtasks: { total: number; resolved: number; open: number };
}

export interface HealthComponent {
  key: string;
  label: string;
  state: 'ok' | 'warning' | 'error';
  detail: string;
  degraded?: boolean;
}

export interface GuestWorkspace {
  subtask: {
    number: string; title: string; description: string;
    status: SubtaskStatus; priority: Priority;
    due_date: string | null; created_at: string;
  };
  ticket: { number: string; subject: string } | null;
  assignee: { name: string | null; organization: string | null };
  comments: { author: string; author_kind: string; body: string; created_at: string }[];
  attachments: Attachment[];
}

export interface Paged<T> { items: T[]; total: number; page: number; page_size: number }
