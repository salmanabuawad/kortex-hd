import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { ArrowLeft, CheckCircle2, MessageSquare, ShieldCheck, XCircle } from 'lucide-react';

import { get, post } from '../lib/api';
import { useAuth } from '../lib/auth';
import { useAction, useAsync } from '../lib/hooks';
import { formatCurrency, formatDate, formatHours, relativeTime } from '../lib/format';
import { approvalStatusLabel, approvalStatusTone, priorityLabel, triggerLabel } from '../lib/labels';
import type { Approval } from '../lib/types';
import {
  Button, Card, Chip, EmptyState, ErrorState, PageHeader, SkeletonRows,
} from '../components/ui';
import { NoteDialog } from '../components/tickets/dialogs';
import { useToast } from '../components/ui/toast';

const FILTERS = [
  { id: 'pending', label: 'ממתינים' },
  { id: 'approved', label: 'אושרו' },
  { id: 'rejected', label: 'נדחו' },
  { id: 'all', label: 'הכל' },
];

export default function Approvals() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const toast = useToast();
  const [filter, setFilter] = useState('pending');
  const [infoFor, setInfoFor] = useState<Approval | null>(null);
  const { busy, run } = useAction();

  const approvals = useAsync<{ items: Approval[] }>(
    () => get<{ items: Approval[] }>(`/approvals?status=${filter}`), [filter]);

  const decide = (approval: Approval, decision: 'approved' | 'rejected') => {
    void run(
      () => post(`/approvals/${approval.id}/decision`, { decision }),
      {
        onSuccess: () => {
          toast.success(decision === 'approved' ? 'הבקשה אושרה' : 'הבקשה נדחתה');
          approvals.reload();
        },
        onError: (message) => toast.error(message),
      },
    );
  };

  const isAdmin = user?.role === 'admin';

  return (
    <>
      <PageHeader
        title="אישורים"
        subtitle="בקשות שחצו את ספי העלות, השעות או סוג השירות שהוגדרו בקטגוריה"
      />

      <div className="toolbar">
        <div className="segmented" role="group" aria-label="סינון אישורים">
          {FILTERS.map((option) => (
            <button
              key={option.id} type="button"
              aria-pressed={filter === option.id}
              onClick={() => setFilter(option.id)}
            >
              {option.label}
            </button>
          ))}
        </div>
      </div>

      {approvals.error ? (
        <ErrorState message={approvals.error} onRetry={approvals.reload} />
      ) : approvals.loading ? (
        <SkeletonRows rows={3} />
      ) : (approvals.data?.items.length ?? 0) === 0 ? (
        <Card>
          <div className="card__body">
            <EmptyState
              icon={<ShieldCheck />}
              title={filter === 'pending' ? 'אין בקשות הממתינות לך' : 'אין בקשות להצגה'}
              text={filter === 'pending'
                ? 'כשקריאה תחצה סף אישור, הבקשה תופיע כאן.'
                : 'נסו לשנות את הסינון.'}
            />
          </div>
        </Card>
      ) : (
        <div className="stack">
          {approvals.data?.items.map((approval) => {
            const mine = approval.approver?.id === user?.id;
            const canDecide = approval.status === 'pending' && (mine || isAdmin);
            return (
              <div className="approval-card" key={approval.id}>
                <span className="kpi__icon kpi__icon--amber"><ShieldCheck /></span>
                <div className="grow">
                  <div className="row row--wrap" style={{ gap: 'var(--space-2)' }}>
                    <Chip tone={approvalStatusTone[approval.status]} dot>
                      {approvalStatusLabel[approval.status]}
                    </Chip>
                    <Chip tone="neutral">
                      {triggerLabel[approval.trigger] ?? approval.trigger}
                    </Chip>
                    {approval.ticket_priority && (
                      <Chip tone="blue">{priorityLabel[approval.ticket_priority]}</Chip>
                    )}
                    <span className="cell-number">{approval.ticket_number}</span>
                    <span className="cell-meta">{approval.category}</span>
                  </div>

                  <button
                    className="work-item__title"
                    style={{
                      marginTop: 'var(--space-2)', background: 'none', border: 'none',
                      padding: 0, textAlign: 'start', fontSize: 'var(--text-md)',
                    }}
                    onClick={() => navigate(`/tickets/${approval.ticket_id}`)}
                  >
                    {approval.ticket_subject}
                  </button>
                  <p className="cell-meta" style={{ marginTop: 2 }}>{approval.reason}</p>

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
                        <div className="approval-card__fact-value">
                          {formatHours(approval.hours)}
                        </div>
                      </div>
                    )}
                    <div>
                      <div className="approval-card__fact-label">מבקש</div>
                      <div className="approval-card__fact-value">
                        {approval.requested_by?.name ?? '—'}
                      </div>
                    </div>
                    <div>
                      <div className="approval-card__fact-label">נשלח</div>
                      <div className="approval-card__fact-value">
                        {formatDate(approval.requested_at)}
                      </div>
                    </div>
                    <div>
                      <div className="approval-card__fact-label">ממתין</div>
                      <div className="approval-card__fact-value">
                        {relativeTime(approval.requested_at)}
                      </div>
                    </div>
                  </div>

                  {approval.decision_note && (
                    <p className="cell-meta">הערה: {approval.decision_note}</p>
                  )}

                  <div className="approval-card__actions">
                    {canDecide ? (
                      <>
                        <Button variant="success" loading={busy}
                                icon={<CheckCircle2 size={16} />}
                                onClick={() => decide(approval, 'approved')}>
                          אישור
                        </Button>
                        <Button variant="danger" loading={busy} icon={<XCircle size={16} />}
                                onClick={() => decide(approval, 'rejected')}>
                          דחייה
                        </Button>
                        <Button variant="ghost" icon={<MessageSquare size={16} />}
                                onClick={() => setInfoFor(approval)}>
                          בקשת הבהרה
                        </Button>
                      </>
                    ) : (
                      <span className="cell-meta">
                        {approval.status === 'pending'
                          ? `ממתין להחלטת ${approval.approver?.name ?? 'הגורם המאשר'}`
                          : `הוכרע ${relativeTime(approval.decided_at)}`}
                      </span>
                    )}
                    <Button variant="ghost" onClick={() => navigate(`/tickets/${approval.ticket_id}`)}>
                      פתיחת הקריאה <ArrowLeft size={15} />
                    </Button>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* "Request more information" posts a comment on the parent ticket, which
          is where the conversation with the resolver actually lives. */}
      <NoteDialog
        open={infoFor !== null} onClose={() => setInfoFor(null)}
        title="בקשת הבהרה" label="מה חסר לך כדי להחליט?" confirmLabel="שליחה"
        placeholder="למשל: נא לצרף הצעת מחיר מספק נוסף"
        banner={{ tone: 'info', text: 'ההודעה תתווסף כתגובה בקריאה ותישלח למטפל. הבקשה תישאר במצב ממתין.' }}
        onSubmit={async (note) => {
          if (!infoFor) return;
          await post(`/tickets/${infoFor.ticket_id}/comments`, { body: note, internal: true });
          toast.success('הבקשה נשלחה למטפל');
        }}
      />
    </>
  );
}
