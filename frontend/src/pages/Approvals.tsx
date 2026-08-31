import { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import type { ColDef, ICellRendererParams } from 'ag-grid-community';
import { ArrowLeft, CheckCircle2, MessageSquare, ShieldCheck, XCircle } from 'lucide-react';

import { get, post } from '../lib/api';
import { useAuth } from '../lib/auth';
import { useAction, useAsync } from '../lib/hooks';
import { formatCurrency, formatHours, relativeTime } from '../lib/format';
import { approvalStatusLabel, approvalStatusTone, triggerLabel } from '../lib/labels';
import type { Approval } from '../lib/types';
import {
  Button, Chip, ErrorState,
} from '../components/ui';
import { PageFrame } from '../components/layout/Shell';
import { DataGrid } from '../components/grid/DataGrid';
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

  const columns = useMemo<ColDef<Approval>[]>(() => [
    {
      colId: 'ticket_number', field: 'ticket_number', headerName: 'מספר', width: 130,
      cellRenderer: (p: ICellRendererParams<Approval>) =>
        <span className="cell-number">{p.value}</span>,
    },
    {
      colId: 'ticket_subject', field: 'ticket_subject', headerName: 'קריאה', flex: 2, minWidth: 220,
      cellRenderer: (p: ICellRendererParams<Approval>) => (
        <span>
          <span className="grid-subject">{p.value}</span>
          <span className="cell-meta" style={{ display: 'block' }}>{p.data?.reason}</span>
        </span>
      ),
    },
    {
      colId: 'category', field: 'category', headerName: 'קטגוריה', width: 150,
    },
    {
      colId: 'status', field: 'status', headerName: 'סטטוס', width: 120,
      cellRenderer: (p: ICellRendererParams<Approval>) => p.data
        ? <Chip tone={approvalStatusTone[p.data.status]} dot>{approvalStatusLabel[p.data.status]}</Chip>
        : null,
    },
    {
      colId: 'reason', headerName: 'סיבה', width: 140,
      valueGetter: (p) => triggerLabel[p.data?.trigger ?? ''] ?? p.data?.trigger,
    },
    {
      colId: 'amount', headerName: 'עלות / היקף', width: 140,
      valueGetter: (p) => [
        p.data?.amount != null ? formatCurrency(p.data.amount) : null,
        p.data?.hours != null ? formatHours(p.data.hours) : null,
      ].filter(Boolean).join(' · ') || '—',
    },
    {
      colId: 'requested_by', headerName: 'מבקש', width: 140,
      valueGetter: (p) => p.data?.requested_by?.name ?? '—',
    },
    {
      colId: 'requested_at', headerName: 'נשלח', width: 130,
      valueGetter: (p) => p.data?.requested_at,
      cellRenderer: (p: ICellRendererParams<Approval>) =>
        <span className="cell-meta">{p.data ? relativeTime(p.data.requested_at) : ''}</span>,
    },
    {
      colId: 'actions', headerName: '', flex: 1, minWidth: 280, sortable: false, filter: false,
      cellRenderer: (p: ICellRendererParams<Approval>) => {
        if (!p.data) return null;
        const mine = p.data.approver?.id === user?.id;
        const canDecide = p.data.status === 'pending' && (mine || isAdmin);
        return (
          <span className="row ag-ignore-row-click" style={{ gap: 6 }}>
            {canDecide ? (
              <>
                <Button size="sm" variant="success" loading={busy} icon={<CheckCircle2 size={16} />}
                        onClick={() => decide(p.data!, 'approved')}>אישור</Button>
                <Button size="sm" variant="danger" loading={busy} icon={<XCircle size={16} />}
                        onClick={() => decide(p.data!, 'rejected')}>דחייה</Button>
                <Button size="sm" variant="ghost" icon={<MessageSquare size={16} />}
                        onClick={() => setInfoFor(p.data!)}>הבהרה</Button>
              </>
            ) : (
              <span className="cell-meta">
                {p.data.status === 'pending'
                  ? `ממתין ל־${p.data.approver?.name ?? 'מאשר'}`
                  : `הוכרע ${relativeTime(p.data.decided_at)}`}
              </span>
            )}
            <Button size="sm" variant="ghost"
                    onClick={() => navigate(`/tickets/${p.data!.ticket_id}`)}>
              פתיחה <ArrowLeft className="dir-icon" size={14} />
            </Button>
          </span>
        );
      },
    },
  ], [busy, isAdmin, user?.id]);

  return (
    <PageFrame
      icon={<ShieldCheck />}
      title="אישורים"
      summary="בקשות שחצו את ספי העלות, השעות או סוג השירות שהוגדרו בקטגוריה"
      filters={
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
      }
    >

      {approvals.error ? (
        <ErrorState message={approvals.error} onRetry={approvals.reload} />
      ) : (
        <DataGrid<Approval>
          gridName="approvals"
          rows={approvals.data?.items ?? []}
          columns={columns}
          loading={approvals.loading}
          getRowId={(row) => String(row.id)}
          onRowClick={(row) => navigate(`/tickets/${row.ticket_id}`)}
          emptyMessage={filter === 'pending' ? 'אין בקשות הממתינות לך' : 'אין בקשות להצגה'}
        />
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
    </PageFrame>
  );
}
