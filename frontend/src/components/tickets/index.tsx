import { useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import type { ColDef, ICellRendererParams } from 'ag-grid-community';
import { Check, CircleDot, Clock, X } from 'lucide-react';

import { formatSlaRemaining, relativeTime } from '../../lib/format';
import {
  priorityLabel, slaLabel, statusLabel, statusTone, slaTone, priorityTone,
} from '../../lib/labels';
import type { Priority, SlaState, TicketRow, TicketStatus } from '../../lib/types';
import { Chip, EmptyState } from '../ui';
import { DataGrid } from '../grid/DataGrid';

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
/* Ticket grid                                                                 */
/* -------------------------------------------------------------------------- */

export function useTicketColumns(showResolver = true): ColDef<TicketRow>[] {
  const { t } = useTranslation();

  return useMemo(() => {
    const defs: ColDef<TicketRow>[] = [
      {
        colId: 'number', field: 'number', headerName: t('columns.number'), width: 130,
        cellRenderer: (p: ICellRendererParams<TicketRow>) =>
          <span className="cell-number">{p.value}</span>,
      },
      {
        colId: 'subject', field: 'subject', headerName: t('columns.subject'), flex: 2,
        minWidth: 240,
        cellRenderer: (p: ICellRendererParams<TicketRow>) => (
          <span>
            <span className="grid-subject">{p.value}</span>
            {p.data?.approval_state === 'pending' && (
              <span className="chip chip--amber" style={{ marginInlineStart: 8 }}>
                {t('approvalStatus.pending')}
              </span>
            )}
          </span>
        ),
      },
      {
        colId: 'category', headerName: t('columns.category'), width: 160,
        valueGetter: (p) => p.data?.category?.name ?? '—',
      },
      {
        colId: 'request_type', headerName: t('columns.requestType'), width: 140,
        valueGetter: (p) => p.data?.request_type?.name ?? '—',
      },
      {
        colId: 'requester', headerName: t('columns.requester'), width: 170,
        valueGetter: (p) => p.data?.requester?.name ?? '—',
        cellRenderer: (p: ICellRendererParams<TicketRow>) => (
          <span className="grid-person">
            <span className="avatar avatar--sm avatar--muted">{p.data?.requester?.initials ?? '—'}</span>
            <span className="cell-meta">{p.data?.requester?.name ?? '—'}</span>
          </span>
        ),
      },
      {
        colId: 'resolver', headerName: t('columns.resolver'), width: 170,
        valueGetter: (p) => p.data?.resolver?.name ?? t('common.unassigned'),
        cellRenderer: (p: ICellRendererParams<TicketRow>) => (
          <span className="cell-meta">{p.data?.resolver?.name ?? t('common.unassigned')}</span>
        ),
      },
      {
        colId: 'priority', headerName: t('columns.priority'), width: 120,
        valueGetter: (p) => p.data?.priority,
        cellRenderer: (p: ICellRendererParams<TicketRow>) =>
          p.data ? <PriorityChip priority={p.data.priority} /> : null,
      },
      {
        colId: 'status', headerName: t('columns.status'), width: 140,
        valueGetter: (p) => p.data?.status,
        cellRenderer: (p: ICellRendererParams<TicketRow>) =>
          p.data ? <StatusChip status={p.data.status} /> : null,
      },
      {
        colId: 'sla', headerName: t('columns.sla'), width: 130,
        valueGetter: (p) => p.data?.sla_state,
        cellRenderer: (p: ICellRendererParams<TicketRow>) =>
          p.data ? <SlaChip state={p.data.sla_state} minutes={p.data.sla_minutes_remaining} /> : null,
      },
      {
        colId: 'updated_at', headerName: t('columns.updated'), width: 140,
        valueGetter: (p) => p.data?.updated_at,
        cellRenderer: (p: ICellRendererParams<TicketRow>) =>
          <span className="cell-meta">{relativeTime(p.value)}</span>,
      },
      {
        colId: 'created_at', headerName: t('columns.created'), width: 140,
        valueGetter: (p) => p.data?.created_at,
        cellRenderer: (p: ICellRendererParams<TicketRow>) =>
          <span className="cell-meta">{relativeTime(p.value)}</span>,
      },
    ];
    return showResolver ? defs : defs.filter((d) => d.colId !== 'resolver');
  }, [t, showResolver]);
}

export function TicketQueue(props: {
  tickets: TicketRow[];
  loading?: boolean;
  showResolver?: boolean;
  emptyTitle?: string;
  emptyText?: string;
  emptyAction?: React.ReactNode;
}) {
  return <TicketTable {...props} allowLayout={false} height={360} />;
}

export function TicketTable({
  tickets, loading, showResolver = true, emptyTitle, emptyText, emptyAction,
  allowLayout = false, height = 420,
}: {
  tickets: TicketRow[];
  loading?: boolean;
  showResolver?: boolean;
  emptyTitle?: string;
  emptyText?: string;
  emptyAction?: React.ReactNode;
  allowLayout?: boolean;
  height?: number | string;
}) {
  const navigate = useNavigate();
  const { t } = useTranslation();
  const columns = useTicketColumns(showResolver);

  if (!loading && !tickets.length) {
    return (
      <EmptyState
        title={emptyTitle ?? 'אין קריאות להצגה'}
        text={emptyText ?? 'כשייפתחו קריאות התואמות את הסינון, הן יופיעו כאן.'}
        action={emptyAction}
      />
    );
  }

  return (
    <DataGrid<TicketRow>
      gridName="tickets"
      rows={tickets}
      columns={columns}
      loading={loading}
      getRowId={(row) => String(row.id)}
      onRowClick={(row) => navigate(`/tickets/${row.id}`)}
      allowLayout={allowLayout}
      emptyMessage={emptyTitle ?? t('grid.noRows')}
      height={height}
    />
  );
}
