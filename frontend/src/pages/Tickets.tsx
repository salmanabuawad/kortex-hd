import { useEffect, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { Plus, Search, SlidersHorizontal, X } from 'lucide-react';

import { get } from '../lib/api';
import { isStaff, useAuth } from '../lib/auth';
import { useAsync, useDebounced } from '../lib/hooks';
import { priorityLabel, statusLabel } from '../lib/labels';
import type { Category, Paged, TicketRow, UserBrief } from '../lib/types';
import {
  Button, Card, ErrorState, PageHeader, Pagination,
} from '../components/ui';
import { TicketTable } from '../components/tickets';

const STATUSES = ['new', 'assigned', 'viewed', 'in_progress', 'resolved', 'rejected', 'reopened'] as const;
const PRIORITIES = ['low', 'normal', 'high', 'urgent'] as const;
const PAGE_SIZE = 25;

export default function Tickets() {
  const { user } = useAuth();
  const staff = isStaff(user);
  const [params, setParams] = useSearchParams();

  const [search, setSearch] = useState(params.get('q') ?? '');
  const debouncedSearch = useDebounced(search, 350);
  const [page, setPage] = useState(1);

  const scope = params.get('scope') ?? '';
  const status = params.get('status') ?? '';
  const categoryId = params.get('category') ?? '';
  const priority = params.get('priority') ?? '';
  const resolverId = params.get('resolver') ?? '';
  const slaState = params.get('sla') ?? '';

  // Any filter change resets to the first page, otherwise page 3 of a new
  // filter shows an empty list.
  useEffect(() => { setPage(1); },
    [debouncedSearch, scope, status, categoryId, priority, resolverId, slaState]);

  const setParam = (key: string, value: string) => {
    const next = new URLSearchParams(params);
    if (value) next.set(key, value); else next.delete(key);
    setParams(next, { replace: true });
  };

  const query = new URLSearchParams();
  if (debouncedSearch.trim()) query.set('q', debouncedSearch.trim());
  if (status) query.set('status', status);
  if (categoryId) query.set('category_id', categoryId);
  if (priority) query.set('priority', priority);
  if (resolverId) query.set('resolver_id', resolverId);
  if (slaState) query.set('sla_state', slaState);
  if (scope) query.set('scope', scope);
  query.set('page', String(page));
  query.set('page_size', String(PAGE_SIZE));

  const tickets = useAsync<Paged<TicketRow>>(
    () => get<Paged<TicketRow>>(`/tickets?${query.toString()}`),
    [query.toString()],
  );

  const categories = useAsync<{ items: Category[] }>(
    () => get<{ items: Category[] }>('/categories'), []);

  const resolvers = useAsync<{ items: UserBrief[] }>(
    () => (staff ? get<{ items: UserBrief[] }>('/users/assignable')
      : Promise.resolve({ items: [] })), [staff]);

  const activeFilters = [status, categoryId, priority, resolverId, slaState, scope]
    .filter(Boolean).length;

  const clearFilters = () => {
    setSearch('');
    setParams(new URLSearchParams(), { replace: true });
  };

  const title = scope === 'mine' ? 'הקריאות שבטיפולי'
    : staff ? 'כל הקריאות' : 'הקריאות שלי';

  return (
    <>
      <PageHeader
        title={title}
        subtitle={staff
          ? 'סינון, חיפוש ומעקב אחר כלל הקריאות במוקד'
          : 'כל הקריאות שפתחת והסטטוס שלהן'}
              />

      <div className="toolbar">
        <div className="toolbar__search">
          <Search aria-hidden />
          <input
            type="search"
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder="חיפוש לפי נושא, תיאור או מספר קריאה…"
            aria-label="חיפוש קריאות"
          />
        </div>

        <select
          className="select" value={status} aria-label="סינון לפי סטטוס"
          onChange={(event) => setParam('status', event.target.value)}
        >
          <option value="">כל הסטטוסים</option>
          <option value="open">פתוחות בלבד</option>
          <option value="closed">סגורות בלבד</option>
          {STATUSES.map((value) => (
            <option key={value} value={value}>{statusLabel[value]}</option>
          ))}
        </select>

        <select
          className="select" value={categoryId} aria-label="סינון לפי קטגוריה"
          onChange={(event) => setParam('category', event.target.value)}
        >
          <option value="">כל הקטגוריות</option>
          {categories.data?.items.map((category) => (
            <option key={category.id} value={category.id}>{category.name}</option>
          ))}
        </select>

        <select
          className="select" value={priority} aria-label="סינון לפי דחיפות"
          onChange={(event) => setParam('priority', event.target.value)}
        >
          <option value="">כל רמות הדחיפות</option>
          {PRIORITIES.map((value) => (
            <option key={value} value={value}>{priorityLabel[value]}</option>
          ))}
        </select>

        {staff && (
          <>
            <select
              className="select" value={resolverId} aria-label="סינון לפי מטפל"
              onChange={(event) => setParam('resolver', event.target.value)}
            >
              <option value="">כל המטפלים</option>
              {resolvers.data?.items.map((person) => (
                <option key={person.id} value={person.id}>{person.name}</option>
              ))}
            </select>

            <select
              className="select" value={slaState} aria-label="סינון לפי זמן תקן"
              onChange={(event) => setParam('sla', event.target.value)}
            >
              <option value="">כל מצבי זמן התקן</option>
              <option value="breached">חריגה</option>
              <option value="at_risk">בסיכון</option>
              <option value="ok">בזמן</option>
            </select>
          </>
        )}

        {activeFilters > 0 && (
          <Button size="sm" variant="ghost" icon={<X size={15} />} onClick={clearFilters}>
            ניקוי סינון ({activeFilters})
          </Button>
        )}
      </div>

      {tickets.error ? (
        <ErrorState message={tickets.error} onRetry={tickets.reload} />
      ) : (
        <Card>
          <div className="card__body card__body--flush">
            <TicketTable
              tickets={tickets.data?.items ?? []}
              loading={tickets.loading}
              showResolver={staff}
              emptyTitle={activeFilters || search ? 'אין קריאות התואמות את הסינון' : 'אין קריאות'}
              emptyText={activeFilters || search
                ? 'נסו להרחיב את הסינון או לנקות אותו.'
                : 'כשייפתחו קריאות הן יופיעו כאן.'}
              emptyAction={activeFilters || search ? (
                <Button variant="secondary" icon={<SlidersHorizontal size={15} />}
                        onClick={clearFilters}>
                  ניקוי הסינון
                </Button>
              ) : (
                <Link to="/tickets/new" className="btn btn--primary">
                  <Plus size={16} /> פתיחת קריאה
                </Link>
              )}
            />
          </div>
          {tickets.data && tickets.data.total > PAGE_SIZE && (
            <Pagination
              page={tickets.data.page}
              pageSize={tickets.data.page_size}
              total={tickets.data.total}
              onChange={setPage}
            />
          )}
        </Card>
      )}
    </>
  );
}
