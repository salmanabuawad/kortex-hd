import { useEffect, useMemo, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import type { ColDef, ICellRendererParams } from 'ag-grid-community';
import { ClipboardList, Inbox, Plus, Search, ShieldCheck, X } from 'lucide-react';

import { get } from '../lib/api';
import { isStaff, useAuth } from '../lib/auth';
import { useAsync, useDebounced } from '../lib/hooks';
import { relativeTime } from '../lib/format';
import type { Category, Paged, TicketRow, UserBrief } from '../lib/types';
import { Button, ErrorState } from '../components/ui';
import { PageFrame, type PageTab } from '../components/layout/Shell';
import { DataGrid } from '../components/grid/DataGrid';
import { PriorityChip, SlaChip, StatusChip } from '../components/tickets';

const GRID = 'tickets';
const PAGE_SIZE = 100;

const STATUSES = ['new', 'assigned', 'viewed', 'in_progress',
  'resolved', 'rejected', 'reopened'] as const;
const PRIORITIES = ['low', 'normal', 'high', 'urgent'] as const;

export default function Tickets() {
  const { t } = useTranslation();
  const { user } = useAuth();
  const navigate = useNavigate();
  const staff = isStaff(user);
  const [params, setParams] = useSearchParams();

  const [search, setSearch] = useState(params.get('q') ?? '');
  const debounced = useDebounced(search, 350);
  const [page, setPage] = useState(1);

  const scope = params.get('scope') ?? '';
  const status = params.get('status') ?? '';
  const categoryId = params.get('category') ?? '';
  const priority = params.get('priority') ?? '';
  const resolverId = params.get('resolver') ?? '';
  const slaState = params.get('sla') ?? '';

  useEffect(() => { setPage(1); },
    [debounced, scope, status, categoryId, priority, resolverId, slaState]);

  const setParam = (key: string, value: string) => {
    const next = new URLSearchParams(params);
    if (value) next.set(key, value); else next.delete(key);
    setParams(next, { replace: true });
  };

  const query = new URLSearchParams();
  if (debounced.trim()) query.set('q', debounced.trim());
  if (status) query.set('status', status);
  if (categoryId) query.set('category_id', categoryId);
  if (priority) query.set('priority', priority);
  if (resolverId) query.set('resolver_id', resolverId);
  if (slaState) query.set('sla_state', slaState);
  if (scope) query.set('scope', scope);
  query.set('page', String(page));
  query.set('page_size', String(PAGE_SIZE));

  const tickets = useAsync<Paged<TicketRow>>(
    () => get<Paged<TicketRow>>(`/tickets?${query.toString()}`), [query.toString()]);
  const categories = useAsync<{ items: Category[] }>(
    () => get<{ items: Category[] }>('/categories'), []);
  const resolvers = useAsync<{ items: UserBrief[] }>(
    () => (staff ? get<{ items: UserBrief[] }>('/users/assignable')
      : Promise.resolve({ items: [] })), [staff]);

  const columns = useMemo<ColDef<TicketRow>[]>(() => {
    const defs: ColDef<TicketRow>[] = [
      {
        colId: 'number', field: 'number', headerName: t('columns.number'), width: 120,
        cellRenderer: (p: ICellRendererParams<TicketRow>) =>
          <span className="cell-number">{p.value}</span>,
      },
      {
        colId: 'subject', field: 'subject', headerName: t('columns.subject'), flex: 2,
        minWidth: 240,
        cellRenderer: (p: ICellRendererParams<TicketRow>) => (
          <span>
            <span style={{ fontWeight: 600 }}>{p.value}</span>
            {p.data?.approval_state === 'pending' && (
              <span className="chip chip--amber" style={{ marginInlineStart: 8 }}>
                {t('approvalStatus.pending')}
              </span>
            )}
          </span>
        ),
      },
      {
        colId: 'category', headerName: t('columns.category'), width: 150,
        valueGetter: (p) => p.data?.category?.name ?? '—',
      },
      {
        colId: 'request_type', headerName: t('columns.requestType'), width: 130,
        valueGetter: (p) => p.data?.request_type?.name ?? '—',
      },
      {
        colId: 'requester', headerName: t('columns.requester'), width: 150,
        valueGetter: (p) => p.data?.requester?.name ?? '—',
      },
      {
        colId: 'resolver', headerName: t('columns.resolver'), width: 150,
        valueGetter: (p) => p.data?.resolver?.name ?? t('common.unassigned'),
      },
      {
        colId: 'priority', headerName: t('columns.priority'), width: 110,
        valueGetter: (p) => p.data?.priority,
        cellRenderer: (p: ICellRendererParams<TicketRow>) =>
          p.data ? <PriorityChip priority={p.data.priority} /> : null,
      },
      {
        colId: 'status', headerName: t('columns.status'), width: 130,
        valueGetter: (p) => p.data?.status,
        cellRenderer: (p: ICellRendererParams<TicketRow>) =>
          p.data ? <StatusChip status={p.data.status} /> : null,
      },
      {
        colId: 'sla', headerName: t('columns.sla'), width: 120,
        valueGetter: (p) => p.data?.sla_state,
        cellRenderer: (p: ICellRendererParams<TicketRow>) =>
          p.data ? <SlaChip state={p.data.sla_state} minutes={p.data.sla_minutes_remaining} /> : null,
      },
      {
        colId: 'updated_at', headerName: t('columns.updated'), width: 130,
        valueGetter: (p) => p.data?.updated_at,
        cellRenderer: (p: ICellRendererParams<TicketRow>) =>
          <span className="cell-meta">{relativeTime(p.value)}</span>,
      },
      {
        colId: 'created_at', headerName: t('columns.created'), width: 130,
        valueGetter: (p) => p.data?.created_at,
        cellRenderer: (p: ICellRendererParams<TicketRow>) =>
          <span className="cell-meta">{relativeTime(p.value)}</span>,
      },
    ];
    return staff ? defs : defs.filter((d) => d.colId !== 'resolver');
  }, [t, staff]);

  const activeFilters = [status, categoryId, priority, resolverId, slaState].filter(Boolean).length;

  const clearFilters = () => {
    setSearch('');
    setParams(new URLSearchParams(), { replace: true });
  };

  const tabs: PageTab[] = staff ? [
    { id: 'all', label: t('nav.allTickets'), icon: <ClipboardList size={15} /> },
    { id: 'mine', label: t('nav.assignedToMe'), icon: <Inbox size={15} /> },
    { id: 'approval', label: t('nav.approvals'), icon: <ShieldCheck size={15} /> },
  ] : [];

  const activeTab = scope === 'mine' ? 'mine' : scope === 'approval' ? 'approval' : 'all';
  const total = tickets.data?.total ?? 0;

  return (
    <PageFrame
      icon={<ClipboardList />}
      title={staff ? t('nav.allTickets') : t('nav.myTickets')}
      summary={`${t('common.all')}: ${total}`}
      tabs={tabs}
      activeTab={activeTab}
      onTabChange={(id) => setParam('scope', id === 'all' ? '' : id)}
      filters={
        <>
          <div className="toolbar__search">
            <Search aria-hidden />
            <input
              type="search"
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder={t('nav.search')}
              aria-label={t('nav.searchLabel')}
            />
          </div>

          <select className="select" value={status} aria-label={t('columns.status')}
                  onChange={(event) => setParam('status', event.target.value)}>
            <option value="">{t('columns.status')}: {t('common.all')}</option>
            <option value="open">{t('sla.ok')}</option>
            {STATUSES.map((value) => (
              <option key={value} value={value}>{t(`status.${value}`)}</option>
            ))}
          </select>

          <select className="select" value={categoryId} aria-label={t('columns.category')}
                  onChange={(event) => setParam('category', event.target.value)}>
            <option value="">{t('columns.category')}: {t('common.all')}</option>
            {categories.data?.items.map((category) => (
              <option key={category.id} value={category.id}>{category.name}</option>
            ))}
          </select>

          <select className="select" value={priority} aria-label={t('columns.priority')}
                  onChange={(event) => setParam('priority', event.target.value)}>
            <option value="">{t('columns.priority')}: {t('common.all')}</option>
            {PRIORITIES.map((value) => (
              <option key={value} value={value}>{t(`priority.${value}`)}</option>
            ))}
          </select>

          {staff && (
            <>
              <select className="select" value={resolverId} aria-label={t('columns.resolver')}
                      onChange={(event) => setParam('resolver', event.target.value)}>
                <option value="">{t('columns.resolver')}: {t('common.all')}</option>
                {resolvers.data?.items.map((person) => (
                  <option key={person.id} value={person.id}>{person.name}</option>
                ))}
              </select>

              <select className="select" value={slaState} aria-label={t('columns.sla')}
                      onChange={(event) => setParam('sla', event.target.value)}>
                <option value="">{t('columns.sla')}: {t('common.all')}</option>
                <option value="breached">{t('sla.breached')}</option>
                <option value="at_risk">{t('sla.at_risk')}</option>
                <option value="ok">{t('sla.ok')}</option>
              </select>
            </>
          )}

          {(activeFilters > 0 || search) && (
            <Button size="sm" variant="ghost" icon={<X size={15} />} onClick={clearFilters}>
              {t('actions.clearFilters')}
            </Button>
          )}
        </>
      }
      actions={
        <Button variant="primary" icon={<Plus size={16} />}
                onClick={() => navigate('/tickets/new')}>
          {t('actions.newTicket')}
        </Button>
      }
    >
      {tickets.error ? (
        <ErrorState message={tickets.error} onRetry={tickets.reload} />
      ) : (
        <DataGrid<TicketRow>
          gridName={GRID}
          rows={tickets.data?.items ?? []}
          columns={columns}
          loading={tickets.loading}
          getRowId={(row) => String(row.id)}
          onRowClick={(row) => navigate(`/tickets/${row.id}`)}
        />
      )}
    </PageFrame>
  );
}
