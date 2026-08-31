import { useNavigate } from 'react-router-dom';
import { Check, CircleDot, Clock, X } from 'lucide-react';

import { formatSlaRemaining, relativeTime } from '../../lib/format';
import {
  priorityLabel, priorityTone, slaLabel, slaTone, statusLabel, statusTone,
} from '../../lib/labels';
import type { Priority, SlaState, TicketRow, TicketStatus } from '../../lib/types';
import { Avatar, Chip, EmptyState, SkeletonRows } from '../ui';

export const StatusChip = ({ status }: { status: TicketStatus }) => (
  <Chip tone={statusTone[status]} dot>{statusLabel[status]}</Chip>
);

export const PriorityChip = ({ priority }: { priority: Priority }) => (
  <Chip tone={priorityTone[priority]}>{priorityLabel[priority]}</Chip>
);

export const SlaChip = ({ state, minutes }: { state: SlaState; minutes?: number | null }) => {
  if (state === 'none') return <span className="cell-meta">—</span>;
  const title = minutes === null || minutes === undefined
    ? slaLabel[state] : formatSlaRemaining(minutes);
  return (
    <span title={title}>
      <Chip tone={slaTone[state]} icon={<Clock aria-hidden />}>{slaLabel[state]}</Chip>
    </span>
  );
};

/* -------------------------------------------------------------------------- */
/* Lifecycle rail                                                              */
/* -------------------------------------------------------------------------- */

const RAIL: { status: TicketStatus; label: string }[] = [
  { status: 'new', label: 'חדש' },
  { status: 'assigned', label: 'הוקצה' },
  { status: 'viewed', label: 'נצפה' },
  { status: 'in_progress', label: 'בטיפול' },
  { status: 'resolved', label: 'נפתר' },
];

const ORDER: Record<TicketStatus, number> = {
  new: 0, assigned: 1, viewed: 2, in_progress: 3, reopened: 3, resolved: 4, rejected: 4,
};

export function LifecycleRail({ status }: { status: TicketStatus }) {
  const current = ORDER[status];
  const rejected = status === 'rejected';

  return (
    <div className="rail" role="group" aria-label="מצב הקריאה">
      {RAIL.map((step, index) => {
        const stepIndex = ORDER[step.status];
        const isCurrent = stepIndex === current;
        const isDone = stepIndex < current;
        // The final node shows rejection rather than resolution when rejected.
        const isLast = index === RAIL.length - 1;
        const showRejected = isLast && rejected;

        const state = showRejected ? 'rejected'
          : isCurrent ? 'current' : isDone ? 'done' : 'todo';

        return (
          <div key={step.status} style={{ display: 'contents' }}>
            <div className={`rail__step rail__step--${state}`}>
              <span className="rail__dot">
                {showRejected ? <X aria-hidden />
                  : isDone ? <Check aria-hidden />
                    : isCurrent ? <CircleDot aria-hidden />
                      : index + 1}
              </span>
              <span className="rail__label">
                {showRejected ? 'נדחה' : step.label}
              </span>
            </div>
            {!isLast && <span className="rail__line" aria-hidden />}
          </div>
        );
      })}
      {status === 'reopened' && (
        <span style={{ marginInlineStart: 'var(--space-4)' }}>
          <Chip tone="amber">נפתח מחדש</Chip>
        </span>
      )}
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/* Ticket table                                                                */
/* -------------------------------------------------------------------------- */

export function TicketQueue({
  tickets, loading, emptyTitle, emptyText, emptyAction,
}: {
  tickets: TicketRow[];
  loading?: boolean;
  emptyTitle?: string;
  emptyText?: string;
  emptyAction?: React.ReactNode;
}) {
  const navigate = useNavigate();

  if (loading) return <SkeletonRows rows={5} />;
  if (!tickets.length) {
    return (
      <EmptyState
        title={emptyTitle ?? 'אין קריאות להצגה'}
        text={emptyText}
        action={emptyAction}
      />
    );
  }

  return (
    <div className="queue">
      {tickets.map((ticket) => (
        <button
          type="button"
          className="queue-item"
          key={ticket.id}
          onClick={() => navigate(`/tickets/${ticket.id}`)}
          aria-label={`קריאה ${ticket.number}: ${ticket.subject}`}
        >
          <span className="queue-item__num num">{ticket.number}</span>
          <span>
            <span className="queue-item__subject">{ticket.subject}</span>
            <span className="queue-item__meta">
              <span>{ticket.requester?.name ?? '—'}</span>
              {ticket.category?.name && <span>{ticket.category.name}</span>}
              {ticket.resolver?.name && <span>{ticket.resolver.name}</span>}
              <span>{relativeTime(ticket.updated_at)}</span>
            </span>
          </span>
          <span className="queue-item__flags">
            <StatusChip status={ticket.status} />
            {(ticket.priority === 'high' || ticket.priority === 'urgent'
              || ticket.sla_state === 'breached' || ticket.sla_state === 'at_risk') && (
              ticket.sla_state === 'breached' || ticket.sla_state === 'at_risk'
                ? <SlaChip state={ticket.sla_state} minutes={ticket.sla_minutes_remaining} />
                : <PriorityChip priority={ticket.priority} />
            )}
          </span>
        </button>
      ))}
    </div>
  );
}

export function TicketTable({
  tickets, loading, showResolver = true, emptyTitle, emptyText, emptyAction,
}: {
  tickets: TicketRow[];
  loading?: boolean;
  showResolver?: boolean;
  emptyTitle?: string;
  emptyText?: string;
  emptyAction?: React.ReactNode;
}) {
  const navigate = useNavigate();

  if (loading) return <SkeletonRows rows={6} />;
  if (!tickets.length) {
    return (
      <EmptyState
        title={emptyTitle ?? 'אין קריאות להצגה'}
        text={emptyText ?? 'כשייפתחו קריאות התואמות את הסינון, הן יופיעו כאן.'}
        action={emptyAction}
      />
    );
  }

  const open = (id: number) => navigate(`/tickets/${id}`);

  return (
    <div className="table-wrap">
      <table className="table">
        <thead>
          <tr>
            <th scope="col">מספר</th>
            <th scope="col">נושא</th>
            <th scope="col">קטגוריה</th>
            <th scope="col">פונה</th>
            {showResolver && <th scope="col">מטפל</th>}
            <th scope="col">דחיפות</th>
            <th scope="col">סטטוס</th>
            <th scope="col">זמן תקן</th>
            <th scope="col">עודכן</th>
          </tr>
        </thead>
        <tbody>
          {tickets.map((ticket) => (
            <tr
              key={ticket.id}
              role="button"
              tabIndex={0}
              onClick={() => open(ticket.id)}
              onKeyDown={(event) => {
                if (event.key === 'Enter' || event.key === ' ') {
                  event.preventDefault();
                  open(ticket.id);
                }
              }}
              aria-label={`קריאה ${ticket.number}: ${ticket.subject}`}
            >
              <td data-label="מספר"><span className="cell-number">{ticket.number}</span></td>
              <td data-label="subject">
                <div className="cell-subject">{ticket.subject}</div>
                {ticket.approval_state === 'pending' && (
                  <span className="cell-meta">ממתין לאישור</span>
                )}
              </td>
              <td data-label="קטגוריה">{ticket.category?.name ?? '—'}</td>
              <td data-label="פונה">
                <span className="row" style={{ gap: 'var(--space-2)' }}>
                  <Avatar initials={ticket.requester?.initials ?? '—'} size="sm" muted />
                  <span>{ticket.requester?.name ?? '—'}</span>
                </span>
              </td>
              {showResolver && (
                <td data-label="מטפל">{ticket.resolver?.name ?? (
                  <span className="cell-meta">לא הוקצה</span>
                )}</td>
              )}
              <td data-label="דחיפות"><PriorityChip priority={ticket.priority} /></td>
              <td data-label="סטטוס"><StatusChip status={ticket.status} /></td>
              <td data-label="זמן תקן">
                <SlaChip state={ticket.sla_state} minutes={ticket.sla_minutes_remaining} />
              </td>
              <td data-label="עודכן">
                <span className="cell-meta">{relativeTime(ticket.updated_at)}</span>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
