import { useMemo, useRef, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import {
  ArrowLeft, ArrowRightLeft, CheckCircle2, Clock, Download, ExternalLink, FileText, History,
  Link2, MessageSquare, Paperclip, Plus, RotateCcw, ShieldCheck, Trash2, Upload,
  UserRound, X, XCircle,
} from 'lucide-react';

import { downloadAttachment, get, patch, post, upload } from '../lib/api';
import { isStaff, useAuth } from '../lib/auth';
import { useAction, useAsync } from '../lib/hooks';
import {
  formatBytes, formatCurrency, formatDate, formatDateTime, formatHours, formatSlaRemaining,
  parseDetails, relativeTime,
} from '../lib/format';
import {
  approvalStatusLabel, approvalStatusTone, assigneeTypeLabel, channelLabel, describeAction,
  priorityLabel, slaLabel, subtaskStatusLabel, subtaskStatusTone, tokenStateLabel, triggerLabel,
} from '../lib/labels';
import type {
  ActivityItem, Approval, Attachment, Subtask, Ticket,
} from '../lib/types';
import {
  Avatar, Banner, Button, Card, CardHeader, Chip, EmptyState, ErrorState, IconButton,
  Skeleton, SkeletonRows, Tabs, type TabSpec,
} from '../components/ui';
import { useToast } from '../components/ui/toast';
import { LifecycleRail, PriorityChip, StatusChip } from '../components/tickets';
import {
  ApprovalRequestDialog, NoteDialog, SubtaskDialog, TransferDialog,
} from '../components/tickets/dialogs';

type TabId = 'overview' | 'activity' | 'subtasks' | 'files' | 'approvals' | 'history';

export default function TicketDetail() {
  const { id } = useParams<{ id: string }>();
  const ticketId = Number(id);
  const navigate = useNavigate();
  const toast = useToast();
  const { user } = useAuth();
  const staff = isStaff(user);

  const [tab, setTab] = useState<TabId>('overview');
  const [transferOpen, setTransferOpen] = useState(false);
  const [subtaskOpen, setSubtaskOpen] = useState(false);
  const [resolveOpen, setResolveOpen] = useState(false);
  const [rejectOpen, setRejectOpen] = useState(false);
  const [reopenOpen, setReopenOpen] = useState(false);
  const [approvalOpen, setApprovalOpen] = useState(false);
  const [newLink, setNewLink] = useState<string | null>(null);

  const ticket = useAsync<Ticket>(() => get<Ticket>(`/tickets/${ticketId}`), [ticketId]);
  const activity = useAsync<{ items: ActivityItem[] }>(
    () => get<{ items: ActivityItem[] }>(`/tickets/${ticketId}/activity`), [ticketId]);
  const subtasks = useAsync<{ items: Subtask[] }>(
    () => get<{ items: Subtask[] }>(`/tickets/${ticketId}/subtasks`), [ticketId]);
  const files = useAsync<{ items: Attachment[] }>(
    () => get<{ items: Attachment[] }>(`/tickets/${ticketId}/attachments`), [ticketId]);
  const approvals = useAsync<{ items: Approval[] }>(
    () => get<{ items: Approval[] }>(`/tickets/${ticketId}/approvals`), [ticketId]);

  const reloadAll = () => {
    ticket.reload(); activity.reload(); subtasks.reload();
    files.reload(); approvals.reload();
  };

  const data = ticket.data;
  const openSubtasks = useMemo(
    () => subtasks.data?.items.filter((s) => s.status === 'open' || s.status === 'in_progress') ?? [],
    [subtasks.data],
  );
  const pendingApprovals = useMemo(
    () => approvals.data?.items.filter((a) => a.status === 'pending') ?? [],
    [approvals.data],
  );

  if (ticket.error) return <ErrorState message={ticket.error} onRetry={ticket.reload} />;
  if (ticket.loading || !data) return <DetailSkeleton />;

  const closed = data.status === 'resolved' || data.status === 'rejected';
  const blockedByApproval = data.approval_state === 'pending';
  const canWork = data.can_work;

  const tabs: TabSpec[] = [
    { id: 'overview', label: 'סקירה', icon: <FileText size={15} /> },
    { id: 'activity', label: 'התכתבות', icon: <MessageSquare size={15} />,
      count: activity.data?.items.filter((i) => i.kind !== 'event').length },
    { id: 'subtasks', label: 'משימות משנה', icon: <ArrowRightLeft size={15} />,
      count: subtasks.data?.items.length },
    { id: 'files', label: 'קבצים', icon: <Paperclip size={15} />, count: files.data?.items.length },
    { id: 'approvals', label: 'אישורים', icon: <ShieldCheck size={15} />,
      count: approvals.data?.items.length },
    { id: 'history', label: 'היסטוריה', icon: <History size={15} /> },
  ];

  return (
    <div className="workarea__body workarea__body--reading">
      <Button variant="ghost" icon={<ArrowLeft size={16} />} onClick={() => navigate('/tickets')}
              style={{ marginBottom: 'var(--space-3)' }}>
        חזרה לרשימת הקריאות
      </Button>

      <header className="ticket-header">
        <div className="ticket-header__top">
          <div className="ticket-header__title">
            <div className="row row--wrap" style={{ gap: 'var(--space-2)', marginBottom: 4 }}>
              <span className="cell-number">{data.number}</span>
              <StatusChip status={data.status} />
              <PriorityChip priority={data.priority} />
              {data.reopen_count > 0 && (
                <Chip tone="amber">נפתחה מחדש ×{data.reopen_count}</Chip>
              )}
            </div>
            <h1>{data.subject}</h1>
            <div className="ticket-header__meta">
              <span>{data.category?.name}</span>
              <span aria-hidden>·</span>
              <span>{data.request_type?.name ?? 'ללא סוג'}</span>
              <span aria-hidden>·</span>
              <span>נפתחה {relativeTime(data.created_at)}</span>
              <span aria-hidden>·</span>
              <span>עודכנה {relativeTime(data.updated_at)}</span>
            </div>
          </div>

          {canWork && !closed && (
            <div className="ticket-header__actions">
              <Button variant="secondary" icon={<ArrowRightLeft size={16} />}
                      onClick={() => setTransferOpen(true)}>
                העברה
              </Button>
              <Button variant="secondary" icon={<Plus size={16} />}
                      onClick={() => setSubtaskOpen(true)}>
                משימת משנה
              </Button>
              <Button variant="secondary" icon={<ShieldCheck size={16} />}
                      onClick={() => setApprovalOpen(true)}>
                בקשת אישור
              </Button>
              <Button variant="success" icon={<CheckCircle2 size={16} />}
                      onClick={() => setResolveOpen(true)}>
                סגירת הקריאה
              </Button>
              <Button variant="danger" icon={<XCircle size={16} />}
                      onClick={() => setRejectOpen(true)}>
                דחייה
              </Button>
            </div>
          )}

          {data.is_requester && closed && (
            <div className="ticket-header__actions">
              <Button variant="primary" icon={<RotateCcw size={16} />}
                      onClick={() => setReopenOpen(true)}>
                לא נפתר — פתיחה מחדש
              </Button>
            </div>
          )}
        </div>

        <LifecycleRail status={data.status} />
      </header>

      {blockedByApproval && (
        <Banner tone="warning" title="הטיפול ממתין לאישור">
          {pendingApprovals[0]?.reason ?? 'קיימת בקשת אישור פתוחה.'}
          {' '}לא ניתן לסגור את הקריאה עד לקבלת ההחלטה.
        </Banner>
      )}
      {data.approval_state === 'rejected' && (
        <Banner tone="danger" title="בקשת האישור נדחתה">
          יש לעדכן את הבקשה או לדחות את הקריאה.
        </Banner>
      )}
      {newLink && (
        <Banner
          tone="success" title="נוצר קישור לגורם החיצוני"
          action={<IconButton label="סגירה" onClick={() => setNewLink(null)}><X /></IconButton>}
        >
          <div className="row row--wrap" style={{ gap: 'var(--space-2)', marginTop: 4 }}>
            <code className="ltr" style={{ fontSize: 'var(--text-xs)', wordBreak: 'break-all' }}>
              {newLink}
            </code>
            <Button size="sm" icon={<Link2 size={14} />} onClick={() => {
              void navigator.clipboard.writeText(newLink);
              toast.success('הקישור הועתק');
            }}>
              העתקה
            </Button>
          </div>
          הקישור נשלח גם בערוץ שנבחר. הוא תקף עד לסיום המשימה.
        </Banner>
      )}

      <Tabs tabs={tabs} active={tab} onChange={(next) => setTab(next as TabId)} />

      {tab === 'overview' && (
        <OverviewTab
          ticket={data} subtasks={subtasks.data?.items ?? []}
          openSubtasks={openSubtasks.length} pending={pendingApprovals}
          onSeeSubtasks={() => setTab('subtasks')}
        />
      )}

      {tab === 'activity' && (
        <ActivityTab
          ticketId={ticketId} items={activity.data?.items ?? []}
          loading={activity.loading} staff={staff}
          onPosted={() => { activity.reload(); ticket.reload(); }}
        />
      )}

      {tab === 'subtasks' && (
        <SubtasksTab
          items={subtasks.data?.items ?? []} loading={subtasks.loading}
          canWork={canWork && !closed} staff={staff}
          onCreate={() => setSubtaskOpen(true)}
          onChanged={() => { subtasks.reload(); activity.reload(); ticket.reload(); }}
          onLink={setNewLink}
        />
      )}

      {tab === 'files' && (
        <FilesTab
          ticketId={ticketId} items={files.data?.items ?? []} loading={files.loading}
          onUploaded={() => { files.reload(); activity.reload(); }}
        />
      )}

      {tab === 'approvals' && (
        <ApprovalsTab
          items={approvals.data?.items ?? []} loading={approvals.loading}
          currentUserId={user?.id} isAdmin={user?.role === 'admin'}
          onDecided={() => { approvals.reload(); ticket.reload(); activity.reload(); }}
          onRequest={() => setApprovalOpen(true)} canRequest={canWork && !closed}
        />
      )}

      {tab === 'history' && (
        <HistoryTab items={activity.data?.items ?? []} loading={activity.loading} />
      )}

      {/* dialogs */}
      <TransferDialog
        open={transferOpen} onClose={() => setTransferOpen(false)}
        ticketId={ticketId} currentCategoryId={data.category?.id}
        onDone={() => { toast.success('הקריאה הועברה'); reloadAll(); }}
      />
      <SubtaskDialog
        open={subtaskOpen} onClose={() => setSubtaskOpen(false)} ticketId={ticketId}
        onDone={(created) => {
          toast.success('נוצרה משימת משנה');
          if (created.guest_link) setNewLink(created.guest_link);
          reloadAll(); setTab('subtasks');
        }}
      />
      <ApprovalRequestDialog
        open={approvalOpen} onClose={() => setApprovalOpen(false)} ticketId={ticketId}
        onDone={() => { toast.success('בקשת האישור נשלחה'); reloadAll(); setTab('approvals'); }}
      />
      <NoteDialog
        open={resolveOpen} onClose={() => setResolveOpen(false)}
        title="סגירת הקריאה" label="תיאור הפתרון" confirmLabel="סגירת הקריאה" tone="success"
        placeholder="מה בוצע בפועל כדי לפתור את הפנייה"
        banner={openSubtasks.length
          ? { tone: 'warning', text: `קיימות ${openSubtasks.length} משימות משנה פתוחות. יש לסגור אותן תחילה.` }
          : { tone: 'info', text: 'פותח הקריאה יקבל עדכון ויוכל לפתוח אותה מחדש אם לא נפתרה.' }}
        onSubmit={async (note) => {
          await post(`/tickets/${ticketId}/resolve`, { note });
          toast.success('הקריאה נסגרה'); reloadAll();
        }}
      />
      <NoteDialog
        open={rejectOpen} onClose={() => setRejectOpen(false)}
        title="דחיית הקריאה" label="סיבת הדחייה" confirmLabel="דחיית הקריאה" tone="danger"
        placeholder="מדוע הפנייה נדחית"
        banner={{ tone: 'warning', text: 'פותח הקריאה יקבל את הסיבה ויוכל לפתוח את הקריאה מחדש.' }}
        onSubmit={async (note) => {
          await post(`/tickets/${ticketId}/reject`, { note });
          toast.success('הקריאה נדחתה'); reloadAll();
        }}
      />
      <NoteDialog
        open={reopenOpen} onClose={() => setReopenOpen(false)}
        title="פתיחת הקריאה מחדש" label="מה עדיין לא נפתר?" confirmLabel="פתיחה מחדש"
        placeholder="פרטו מה נותר לטפל בו"
        banner={{ tone: 'info', text: 'הקריאה חוזרת לטיפול עם כל ההיסטוריה, התגובות והקבצים הקיימים. לא נוצרת קריאה חדשה.' }}
        onSubmit={async (reason) => {
          await post(`/tickets/${ticketId}/reopen`, { reason });
          toast.success('הקריאה נפתחה מחדש'); reloadAll();
        }}
      />
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/* Overview                                                                    */
/* -------------------------------------------------------------------------- */

function OverviewTab({
  ticket, subtasks, openSubtasks, pending, onSeeSubtasks,
}: {
  ticket: Ticket; subtasks: Subtask[]; openSubtasks: number;
  pending: Approval[]; onSeeSubtasks: () => void;
}) {
  return (
    <div className="detail-layout">
      <div className="stack">
        <Card>
          <CardHeader title="תיאור הפנייה" />
          <div className="card__body">
            <p style={{ whiteSpace: 'pre-wrap', lineHeight: 'var(--leading-normal)' }}>
              {ticket.description}
            </p>
          </div>
        </Card>

        {ticket.resolution_note && (
          <Card>
            <CardHeader
              title={ticket.status === 'rejected' ? 'סיבת הדחייה' : 'תיאור הפתרון'}
              icon={ticket.status === 'rejected'
                ? <XCircle size={17} style={{ color: 'var(--danger-text)' }} />
                : <CheckCircle2 size={17} style={{ color: 'var(--success-text)' }} />}
            />
            <div className="card__body">
              <p style={{ whiteSpace: 'pre-wrap' }}>{ticket.resolution_note}</p>
            </div>
          </Card>
        )}

        {subtasks.length > 0 && (
          <Card>
            <CardHeader
              title="משימות משנה"
              action={
                <Button size="sm" variant="ghost" onClick={onSeeSubtasks}>
                  {openSubtasks > 0 ? `${openSubtasks} פתוחות` : 'הצגה'}
                  <ArrowLeft size={14} />
                </Button>
              }
            />
            <div className="card__body stack" style={{ gap: 'var(--space-2)' }}>
              {subtasks.slice(0, 4).map((item) => (
                <div className="row" key={item.id} style={{ gap: 'var(--space-3)' }}>
                  <Chip tone={subtaskStatusTone[item.status]} dot>
                    {subtaskStatusLabel[item.status]}
                  </Chip>
                  <span className="grow">{item.title}</span>
                  <span className="cell-meta">
                    {item.assignee_type === 'external'
                      ? item.external_name : item.assignee?.name}
                  </span>
                </div>
              ))}
            </div>
          </Card>
        )}
      </div>

      <div className="stack">
        <Card>
          <div className="card__body">
            <div className={`sla-card sla-card--${ticket.sla_state}`}>
              <div className="sla-card__value">
                {ticket.sla_state === 'none' ? 'ללא יעד'
                  : formatSlaRemaining(ticket.sla_minutes_remaining)}
              </div>
              <div className="sla-card__label">
                זמן תקן · {slaLabel[ticket.sla_state]}
                {ticket.sla_due_at && ` · יעד ${formatDateTime(ticket.sla_due_at)}`}
              </div>
            </div>
          </div>
        </Card>

        <Card>
          <CardHeader title="גורם מטפל" icon={<UserRound size={17} />} />
          <div className="card__body">
            {ticket.resolver ? (
              <div className="row">
                <Avatar initials={ticket.resolver.initials} size="lg" />
                <div className="grow">
                  <div style={{ fontWeight: 600 }}>{ticket.resolver.name}</div>
                  <div className="cell-meta">{ticket.category?.name}</div>
                </div>
              </div>
            ) : (
              <p className="cell-meta">הקריאה טרם הוקצתה לגורם מטפל.</p>
            )}
          </div>
        </Card>

        <Card>
          <CardHeader title="פרטי הפונה" />
          <div className="card__body meta-block">
            <div className="meta-row">
              <span className="meta-row__label">שם</span>
              <span className="meta-row__value">{ticket.requester_detail?.name}</span>
            </div>
            {ticket.requester_detail?.title && (
              <div className="meta-row">
                <span className="meta-row__label">תפקיד</span>
                <span className="meta-row__value">{ticket.requester_detail.title}</span>
              </div>
            )}
            {ticket.requester_detail?.department && (
              <div className="meta-row">
                <span className="meta-row__label">מחלקה</span>
                <span className="meta-row__value">{ticket.requester_detail.department}</span>
              </div>
            )}
            <div className="meta-row">
              <span className="meta-row__label">דוא״ל</span>
              <span className="meta-row__value ltr">{ticket.requester_detail?.email}</span>
            </div>
            {ticket.requester_detail?.phone && (
              <div className="meta-row">
                <span className="meta-row__label">טלפון</span>
                <span className="meta-row__value ltr">{ticket.requester_detail.phone}</span>
              </div>
            )}
          </div>
        </Card>

        <Card>
          <CardHeader title="נתוני הקריאה" />
          <div className="card__body meta-block">
            <div className="meta-row">
              <span className="meta-row__label">נפתחה</span>
              <span className="meta-row__value">{formatDateTime(ticket.created_at)}</span>
            </div>
            {ticket.first_viewed_at && (
              <div className="meta-row">
                <span className="meta-row__label">נצפתה</span>
                <span className="meta-row__value">{formatDateTime(ticket.first_viewed_at)}</span>
              </div>
            )}
            {ticket.resolved_at && (
              <div className="meta-row">
                <span className="meta-row__label">נסגרה</span>
                <span className="meta-row__value">{formatDateTime(ticket.resolved_at)}</span>
              </div>
            )}
            {ticket.estimated_cost !== null && (
              <div className="meta-row">
                <span className="meta-row__label">עלות</span>
                <span className="meta-row__value">{formatCurrency(ticket.estimated_cost)}</span>
              </div>
            )}
            {ticket.estimated_hours !== null && (
              <div className="meta-row">
                <span className="meta-row__label">היקף</span>
                <span className="meta-row__value">{formatHours(ticket.estimated_hours)}</span>
              </div>
            )}
            <div className="meta-row">
              <span className="meta-row__label">אישור</span>
              <span className="meta-row__value">
                {pending.length > 0
                  ? <Chip tone="amber">ממתין ({pending.length})</Chip>
                  : ticket.approval_state === 'approved' ? <Chip tone="green">אושר</Chip>
                    : ticket.approval_state === 'rejected' ? <Chip tone="red">נדחה</Chip>
                      : <span className="cell-meta">לא נדרש</span>}
              </span>
            </div>
          </div>
        </Card>
      </div>
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/* Activity                                                                    */
/* -------------------------------------------------------------------------- */

function ActivityTab({
  ticketId, items, loading, staff, onPosted,
}: {
  ticketId: number; items: ActivityItem[]; loading: boolean;
  staff: boolean; onPosted: () => void;
}) {
  const [body, setBody] = useState('');
  const [internal, setInternal] = useState(false);
  const { busy, run } = useAction();
  const toast = useToast();

  const send = () => {
    if (!body.trim()) return;
    void run(
      () => post(`/tickets/${ticketId}/comments`, { body: body.trim(), internal }),
      {
        onSuccess: () => { setBody(''); onPosted(); toast.success(internal ? 'ההערה נוספה' : 'התגובה נשלחה'); },
        onError: (message) => toast.error(message),
      },
    );
  };

  return (
    <Card>
      <CardHeader title="התכתבות ואירועים" />
        <div className="card__body stack" style={{ gap: 'var(--space-5)' }}>
          {loading ? <SkeletonRows rows={4} /> : items.length === 0 ? (
            <EmptyState title="אין עדיין תגובות" text="כל הודעה או פעולה יופיעו כאן." />
          ) : (
            <div className="timeline">
              {items.map((item) => <TimelineEntry key={`${item.kind}-${item.id}`} item={item} />)}
            </div>
          )}

          <div className="composer">
            {staff && (
              <div className="composer__tabs" role="group" aria-label="סוג התגובה">
                <button type="button" className="composer__tab" aria-pressed={!internal}
                        onClick={() => setInternal(false)}>
                  תגובה לפונה
                </button>
                <button type="button" className="composer__tab" aria-pressed={internal}
                        onClick={() => setInternal(true)}>
                  הערה פנימית
                </button>
              </div>
            )}
            <textarea
              className="textarea"
              value={body}
              onChange={(event) => setBody(event.target.value)}
              placeholder={internal
                ? 'הערה פנימית — הפונה לא יראה אותה'
                : 'כתבו תגובה לפונה…'}
              aria-label={internal ? 'הערה פנימית' : 'תגובה לפונה'}
            />
            <div className="composer__foot">
              {internal && (
                <span className="chip chip--amber">גלוי לצוות בלבד</span>
              )}
              <div className="grow" />
              <Button variant="primary" size="sm" loading={busy}
                      disabled={!body.trim()} onClick={send}>
                שליחה
              </Button>
            </div>
          </div>
      </div>
    </Card>
  );
}

function TimelineEntry({ item }: { item: ActivityItem }) {
  if (item.kind === 'event') {
    const details = parseDetails(item.details);
    const extra = details?.reason || details?.note || details?.to || details?.decision;
    return (
      <div className="entry entry--event">
        <span className="entry__dot"><Clock /></span>
        <span className="entry__text">
          <strong>{item.actor}</strong>
          <span>{describeAction(item.action ?? '')}</span>
          {typeof extra === 'string' && extra && <span>— {extra}</span>}
          <span className="entry__time">{relativeTime(item.created_at)}</span>
        </span>
      </div>
    );
  }

  const isNote = item.kind === 'note';
  const isStaffAuthor = item.author_role && item.author_role !== 'requester';
  const variant = isNote ? 'note' : isStaffAuthor ? 'staff' : 'requester';

  return (
    <div className={`entry entry--${variant}`}>
      <Avatar initials={item.initials ?? '—'} muted={!isStaffAuthor} />
      <div className="entry__body">
        <div className="entry__head">
          <span className="entry__author">{item.author}</span>
          <span className="entry__time" title={formatDateTime(item.created_at)}>
            {relativeTime(item.created_at)}
          </span>
        </div>
        <div className="entry__bubble">{item.body}</div>
      </div>
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/* Subtasks                                                                    */
/* -------------------------------------------------------------------------- */

function SubtasksTab({
  items, loading, canWork, staff, onCreate, onChanged, onLink,
}: {
  items: Subtask[]; loading: boolean; canWork: boolean; staff: boolean;
  onCreate: () => void; onChanged: () => void; onLink: (link: string) => void;
}) {
  const toast = useToast();
  const { busy, run } = useAction();
  const [working, setWorking] = useState<number | null>(null);

  const act = (subtaskId: number, task: () => Promise<unknown>, message: string) => {
    setWorking(subtaskId);
    void run(task, {
      onSuccess: () => { toast.success(message); onChanged(); setWorking(null); },
      onError: (error) => { toast.error(error); setWorking(null); },
    });
  };

  if (loading) return <SkeletonRows rows={3} />;

  if (!items.length) {
    return (
      <Card>
        <div className="card__body">
          <EmptyState
            title="אין משימות משנה"
            text="אפשר לפצל את הקריאה למשימות עבור עובדי המועצה או עבור ספק חיצוני."
            action={canWork ? (
              <Button variant="primary" icon={<Plus size={16} />} onClick={onCreate}>
                יצירת משימת משנה
              </Button>
            ) : undefined}
          />
        </div>
      </Card>
    );
  }

  return (
    <div className="stack">
      {canWork && (
        <div className="row">
          <Button variant="primary" icon={<Plus size={16} />} onClick={onCreate}>
            משימת משנה חדשה
          </Button>
        </div>
      )}

      <div className="worklist">
        {items.map((item) => {
          const external = item.assignee_type === 'external';
          const active = item.status === 'open' || item.status === 'in_progress';
          return (
            <div className="work-item" key={item.id} style={{ flexDirection: 'column' }}>
              <div className="row" style={{ width: '100%', alignItems: 'flex-start' }}>
                <span className={`work-item__icon work-item__icon--${item.assignee_type}`}>
                  {external ? <ExternalLink size={17} /> : <UserRound size={17} />}
                </span>
                <div className="grow">
                  <div className="row row--wrap" style={{ gap: 'var(--space-2)' }}>
                    <span className="cell-number">{item.number}</span>
                    <Chip tone={subtaskStatusTone[item.status]} dot>
                      {subtaskStatusLabel[item.status]}
                    </Chip>
                    <Chip tone="neutral">{assigneeTypeLabel[item.assignee_type]}</Chip>
                  </div>
                  <div className="work-item__title" style={{ marginTop: 4 }}>{item.title}</div>
                  {item.description && (
                    <p className="cell-meta" style={{ marginTop: 4 }}>{item.description}</p>
                  )}
                  <div className="work-item__meta">
                    <span>
                      אחראי: {external
                        ? `${item.external_name}${item.external_org ? ` · ${item.external_org}` : ''}`
                        : item.assignee?.name ?? '—'}
                    </span>
                    {item.due_date && <span>יעד: {formatDate(item.due_date)}</span>}
                    <span>דחיפות: {priorityLabel[item.priority]}</span>
                    {item.last_external_activity_at && (
                      <span>פעילות אחרונה: {relativeTime(item.last_external_activity_at)}</span>
                    )}
                  </div>
                </div>

              </div>

              {external && staff && item.token && (
                <div className="token-strip">
                  <Chip tone={item.token.state === 'active' ? 'green' : 'neutral'} dot>
                    {tokenStateLabel[item.token.state]}
                  </Chip>
                  {item.token.prefix && (
                    <span className="ltr cell-meta">…{item.token.prefix}</span>
                  )}
                  {item.external_channel && (
                    <span className="cell-meta">
                      נשלח ב{channelLabel[item.external_channel]}
                    </span>
                  )}
                  {item.token.last_used_at && (
                    <span className="cell-meta">
                      נצפה לאחרונה {relativeTime(item.token.last_used_at)}
                    </span>
                  )}
                  <div className="grow" />
                  {canWork && active && (
                    <>
                      <Button size="sm" variant="ghost" icon={<Link2 size={14} />}
                              disabled={busy && working === item.id}
                              onClick={() => act(item.id, async () => {
                                const result = await post<{ guest_link: string }>(
                                  `/subtasks/${item.id}/token/regenerate`);
                                onLink(result.guest_link);
                              }, 'הונפק קישור חדש')}>
                        הנפקת קישור חדש
                      </Button>
                      {item.token.state === 'active' && (
                        <Button size="sm" variant="danger" icon={<Trash2 size={14} />}
                                disabled={busy && working === item.id}
                                onClick={() => act(item.id,
                                  () => post(`/subtasks/${item.id}/token/revoke`), 'הקישור בוטל')}>
                          ביטול הקישור
                        </Button>
                      )}
                    </>
                  )}
                </div>
              )}

              {canWork && active && (
                <div className="row" style={{ width: '100%', gap: 'var(--space-2)' }}>
                  {item.status === 'open' && (
                    <Button size="sm" disabled={busy && working === item.id}
                            onClick={() => act(item.id, () => patchSubtask(item.id, 'in_progress'),
                              'המשימה בביצוע')}>
                      התחלת ביצוע
                    </Button>
                  )}
                  <Button size="sm" variant="success" disabled={busy && working === item.id}
                          onClick={() => act(item.id, () => patchSubtask(item.id, 'resolved'),
                            'המשימה הושלמה')}>
                    סימון כהושלמה
                  </Button>
                  <Button size="sm" variant="ghost" disabled={busy && working === item.id}
                          onClick={() => act(item.id, () => patchSubtask(item.id, 'closed'),
                            'המשימה נסגרה')}>
                    סגירה
                  </Button>
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

const patchSubtask = (subtaskId: number, status: string) =>
  patch(`/subtasks/${subtaskId}`, { status });

/* -------------------------------------------------------------------------- */
/* Files                                                                       */
/* -------------------------------------------------------------------------- */

function FilesTab({
  ticketId, items, loading, onUploaded,
}: { ticketId: number; items: Attachment[]; loading: boolean; onUploaded: () => void }) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const toast = useToast();

  const choose = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;
    setBusy(true);
    try {
      await upload(`/tickets/${ticketId}/attachments`, file);
      toast.success('הקובץ צורף');
      onUploaded();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'העלאת הקובץ נכשלה');
    } finally {
      setBusy(false);
      if (inputRef.current) inputRef.current.value = '';
    }
  };

  return (
    <Card>
      <CardHeader
        title="קבצים מצורפים"
        action={
          <>
            <input ref={inputRef} type="file" hidden onChange={choose} />
            <Button variant="primary" size="sm" loading={busy}
                    icon={<Upload size={15} />} onClick={() => inputRef.current?.click()}>
              צירוף קובץ
            </Button>
          </>
        }
      />
      <div className="card__body">
        {loading ? <SkeletonRows rows={3} /> : items.length === 0 ? (
          <EmptyState
            title="אין קבצים מצורפים"
            text="ניתן לצרף תמונות, מסמכים וקובצי PDF עד 20 מגהבייט."
            icon={<Paperclip />}
          />
        ) : (
          <div className="worklist">
            {items.map((file) => (
              <div className="work-item" key={file.id}>
                <span className="work-item__icon work-item__icon--internal">
                  <FileText size={17} />
                </span>
                <div className="grow">
                  <div className="work-item__title">{file.filename}</div>
                  <div className="work-item__meta">
                    <span>{formatBytes(file.size_bytes)}</span>
                    <span>הועלה על ידי {file.uploaded_by}</span>
                    <span>{relativeTime(file.created_at)}</span>
                  </div>
                </div>
                <Button size="sm" icon={<Download size={14} />}
                        onClick={() => void downloadAttachment('ticket', file.id, file.filename)}>
                  הורדה
                </Button>
              </div>
            ))}
          </div>
        )}
      </div>
    </Card>
  );
}

/* -------------------------------------------------------------------------- */
/* Approvals                                                                   */
/* -------------------------------------------------------------------------- */

function ApprovalsTab({
  items, loading, currentUserId, isAdmin, onDecided, onRequest, canRequest,
}: {
  items: Approval[]; loading: boolean; currentUserId?: number; isAdmin: boolean;
  onDecided: () => void; onRequest: () => void; canRequest: boolean;
}) {
  const toast = useToast();
  const { busy, run } = useAction();

  const decide = (approvalId: number, decision: 'approved' | 'rejected') => {
    void run(
      () => post(`/approvals/${approvalId}/decision`, { decision }),
      {
        onSuccess: () => { toast.success(decision === 'approved' ? 'הבקשה אושרה' : 'הבקשה נדחתה'); onDecided(); },
        onError: (message) => toast.error(message),
      },
    );
  };

  if (loading) return <SkeletonRows rows={2} />;

  if (!items.length) {
    return (
      <Card>
        <div className="card__body">
          <EmptyState
            title="לא נדרשו אישורים"
            text="הקריאה אינה חוצה את ספי האישור שהוגדרו בקטגוריה."
            icon={<ShieldCheck />}
            action={canRequest ? (
              <Button variant="secondary" onClick={onRequest}>בקשת אישור ידנית</Button>
            ) : undefined}
          />
        </div>
      </Card>
    );
  }

  return (
    <div className="stack">
      {items.map((approval) => {
        const mine = approval.approver?.id === currentUserId;
        const canDecide = approval.status === 'pending' && (mine || isAdmin);
        return (
          <div className="approval-card" key={approval.id}>
            <span className="kpi__icon kpi__icon--amber"><ShieldCheck /></span>
            <div className="grow">
              <div className="row row--wrap" style={{ gap: 'var(--space-2)' }}>
                <Chip tone={approvalStatusTone[approval.status]} dot>
                  {approvalStatusLabel[approval.status]}
                </Chip>
                <Chip tone="neutral">{triggerLabel[approval.trigger] ?? approval.trigger}</Chip>
              </div>
              <p style={{ fontWeight: 600, marginTop: 'var(--space-2)' }}>{approval.reason}</p>

              <div className="approval-card__facts">
                {approval.amount !== null && (
                  <div>
                    <div className="approval-card__fact-label">עלות משוערת</div>
                    <div className="approval-card__fact-value">
                      {formatCurrency(approval.amount)}
                    </div>
                  </div>
                )}
                {approval.hours !== null && (
                  <div>
                    <div className="approval-card__fact-label">היקף עבודה</div>
                    <div className="approval-card__fact-value">{formatHours(approval.hours)}</div>
                  </div>
                )}
                <div>
                  <div className="approval-card__fact-label">מבקש</div>
                  <div className="approval-card__fact-value">
                    {approval.requested_by?.name ?? '—'}
                  </div>
                </div>
                <div>
                  <div className="approval-card__fact-label">מאשר</div>
                  <div className="approval-card__fact-value">
                    {approval.approver?.name ?? '—'}
                  </div>
                </div>
                <div>
                  <div className="approval-card__fact-label">נשלח</div>
                  <div className="approval-card__fact-value">
                    {formatDate(approval.requested_at)}
                  </div>
                </div>
              </div>

              {approval.decision_note && (
                <p className="cell-meta">הערת המחליט: {approval.decision_note}</p>
              )}

              {canDecide && (
                <div className="approval-card__actions">
                  <Button variant="success" icon={<CheckCircle2 size={16} />} loading={busy}
                          onClick={() => decide(approval.id, 'approved')}>
                    אישור
                  </Button>
                  <Button variant="danger" icon={<XCircle size={16} />} loading={busy}
                          onClick={() => decide(approval.id, 'rejected')}>
                    דחייה
                  </Button>
                </div>
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/* History                                                                     */
/* -------------------------------------------------------------------------- */

function HistoryTab({ items, loading }: { items: ActivityItem[]; loading: boolean }) {
  const events = items.filter((item) => item.kind === 'event');
  if (loading) return <SkeletonRows rows={5} />;

  return (
    <Card>
      <CardHeader title="היסטוריית הקריאה" icon={<History size={17} />} />
      <div className="card__body">
        {events.length === 0 ? (
          <EmptyState title="אין אירועים" />
        ) : (
          <div className="timeline">
            {[...events].reverse().map((event) => {
              const details = parseDetails(event.details);
              return (
                <div className="entry entry--event" key={event.id}>
                  <span className="entry__dot"><Clock /></span>
                  <span className="entry__text">
                    <strong>{event.actor}</strong>
                    <span>{describeAction(event.action ?? '')}</span>
                    {details && Object.keys(details).length > 0 && (
                      <span className="cell-meta">
                        {Object.entries(details)
                          .map(([key, value]) => `${key}: ${String(value)}`)
                          .join(' · ')}
                      </span>
                    )}
                    <span className="entry__time" title={formatDateTime(event.created_at)}>
                      {formatDateTime(event.created_at)}
                    </span>
                  </span>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </Card>
  );
}

/* -------------------------------------------------------------------------- */

function DetailSkeleton() {
  return (
    <div className="stack">
      <div className="ticket-header">
        <Skeleton width="30%" height={12} />
        <div style={{ height: 12 }} />
        <Skeleton width="60%" height={24} />
        <div style={{ height: 20 }} />
        <Skeleton height={40} radius={8} />
      </div>
      <SkeletonRows rows={4} />
    </div>
  );
}
