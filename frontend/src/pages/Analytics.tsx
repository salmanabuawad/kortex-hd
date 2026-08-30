import { useState } from 'react';
import {
  CheckCircle2, Clock, ExternalLink, RotateCcw, ShieldCheck, Ticket, TrendingUp,
} from 'lucide-react';

import { get } from '../lib/api';
import { useAsync } from '../lib/hooks';
import { formatNumber } from '../lib/format';
import type { AnalyticsData, Category, UserBrief } from '../lib/types';
import {
  Card, CardHeader, EmptyState, ErrorState, PageHeader, SkeletonCards,
} from '../components/ui';

const RANGES = [
  { days: 7, label: '7 ימים' },
  { days: 30, label: '30 יום' },
  { days: 90, label: '90 יום' },
  { days: 365, label: 'שנה' },
];

const DONUT_COLORS = ['var(--blue-500)', 'var(--purple-600)', 'var(--green-500)',
  'var(--amber-500)', 'var(--red-500)', 'var(--slate-400)'];

export default function Analytics() {
  const [days, setDays] = useState(30);
  const [categoryId, setCategoryId] = useState('');
  const [resolverId, setResolverId] = useState('');

  const query = new URLSearchParams({ days: String(days) });
  if (categoryId) query.set('category_id', categoryId);
  if (resolverId) query.set('resolver_id', resolverId);

  const analytics = useAsync<AnalyticsData>(
    () => get<AnalyticsData>(`/analytics?${query.toString()}`), [query.toString()]);
  const categories = useAsync<{ items: Category[] }>(
    () => get<{ items: Category[] }>('/categories?include_inactive=true'), []);
  const people = useAsync<{ items: UserBrief[] }>(
    () => get<{ items: UserBrief[] }>('/users/assignable'), []);

  const data = analytics.data;
  const maxVolume = Math.max(...(data?.volume.map((point) => point.count) ?? [1]), 1);

  return (
    <>
      <PageHeader title="דוחות" subtitle="נפח פניות, זמני טיפול ועמידה בזמן תקן" />

      <div className="toolbar">
        <div className="segmented" role="group" aria-label="טווח תאריכים">
          {RANGES.map((range) => (
            <button
              key={range.days} type="button"
              aria-pressed={days === range.days}
              onClick={() => setDays(range.days)}
            >
              {range.label}
            </button>
          ))}
        </div>
        <select className="select" value={categoryId} aria-label="סינון לפי קטגוריה"
                onChange={(event) => setCategoryId(event.target.value)}>
          <option value="">כל הקטגוריות</option>
          {categories.data?.items.map((category) => (
            <option key={category.id} value={category.id}>{category.name}</option>
          ))}
        </select>
        <select className="select" value={resolverId} aria-label="סינון לפי מטפל"
                onChange={(event) => setResolverId(event.target.value)}>
          <option value="">כל המטפלים</option>
          {people.data?.items.map((person) => (
            <option key={person.id} value={person.id}>{person.name}</option>
          ))}
        </select>
      </div>

      {analytics.error ? (
        <ErrorState message={analytics.error} onRetry={analytics.reload} />
      ) : analytics.loading || !data ? (
        <SkeletonCards count={4} />
      ) : (
        <>
          <div className="grid grid--4" style={{ marginBottom: 'var(--space-4)' }}>
            <div className="kpi">
              <span className="kpi__icon kpi__icon--blue"><Ticket /></span>
              <span className="grow">
                <span className="kpi__value num" style={{ display: 'block' }}>
                  {formatNumber(data.totals.created)}
                </span>
                <span className="kpi__label">קריאות נפתחו</span>
              </span>
            </div>
            <div className="kpi">
              <span className="kpi__icon kpi__icon--green"><CheckCircle2 /></span>
              <span className="grow">
                <span className="kpi__value num" style={{ display: 'block' }}>
                  {formatNumber(data.totals.closed)}
                </span>
                <span className="kpi__label">קריאות נסגרו</span>
              </span>
            </div>
            <div className="kpi">
              <span className="kpi__icon kpi__icon--purple"><Clock /></span>
              <span className="grow">
                <span className="kpi__value num" style={{ display: 'block' }}>
                  {data.totals.avg_resolution_hours !== null
                    ? `${data.totals.avg_resolution_hours}` : '—'}
                </span>
                <span className="kpi__label">שעות ממוצע לסגירה</span>
              </span>
            </div>
            <div className="kpi">
              <span className="kpi__icon kpi__icon--amber"><TrendingUp /></span>
              <span className="grow">
                <span className="kpi__value num" style={{ display: 'block' }}>
                  {data.totals.sla_rate !== null ? `${data.totals.sla_rate}%` : '—'}
                </span>
                <span className="kpi__label">עמידה בזמן תקן</span>
              </span>
            </div>
          </div>

          <Card style={{ marginBottom: 'var(--space-4)' }}>
            <CardHeader title="נפח פניות לאורך זמן" />
            <div className="card__body">
              {data.volume.length === 0 ? (
                <EmptyState title="אין נתונים בטווח שנבחר" />
              ) : (
                <>
                  <div className="spark" role="img"
                       aria-label={`נפח פניות: ${data.totals.created} קריאות`}>
                    {data.volume.map((point) => (
                      <span
                        key={point.date}
                        className="spark__bar"
                        style={{ height: `${Math.max((point.count / maxVolume) * 100, 4)}%` }}
                        title={`${point.date}: ${point.count}`}
                      />
                    ))}
                  </div>
                  <div className="row" style={{ justifyContent: 'space-between',
                                                marginTop: 'var(--space-2)' }}>
                    <span className="cell-meta ltr">{data.volume[0]?.date}</span>
                    <span className="cell-meta ltr">
                      {data.volume[data.volume.length - 1]?.date}
                    </span>
                  </div>
                </>
              )}
            </div>
          </Card>

          <div className="grid grid--2" style={{ marginBottom: 'var(--space-4)' }}>
            <Card>
              <CardHeader title="קריאות לפי קטגוריה" />
              <div className="card__body">
                <Bars rows={data.by_category} color="var(--primary)" />
              </div>
            </Card>
            <Card>
              <CardHeader title="קריאות לפי מטפל" />
              <div className="card__body">
                <Bars rows={data.by_resolver} color="var(--accent)" />
              </div>
            </Card>
          </div>

          <div className="grid grid--3">
            <Card>
              <CardHeader title="אישורים" icon={<ShieldCheck size={17} />} />
              <div className="card__body">
                <Donut
                  segments={[
                    { label: 'אושרו', value: data.approvals.approved },
                    { label: 'נדחו', value: data.approvals.rejected },
                    { label: 'ממתינים', value: data.approvals.pending },
                  ]}
                />
              </div>
            </Card>

            <Card>
              <CardHeader title="משימות לספקים חיצוניים" icon={<ExternalLink size={17} />} />
              <div className="card__body">
                <Donut
                  segments={[
                    { label: 'הושלמו', value: data.external_subtasks.resolved },
                    { label: 'פתוחות', value: data.external_subtasks.open },
                  ]}
                />
              </div>
            </Card>

            <Card>
              <CardHeader title="קריאות שנפתחו מחדש" icon={<RotateCcw size={17} />} />
              <div className="card__body">
                <div className="kpi__value num">{data.totals.reopened}</div>
                <p className="cell-meta">
                  מתוך {data.totals.created} קריאות בטווח.
                  {data.totals.created > 0 && (
                    <> שיעור פתיחה מחדש{' '}
                      {Math.round((data.totals.reopened / data.totals.created) * 100)}%.</>
                  )}
                </p>
              </div>
            </Card>
          </div>
        </>
      )}
    </>
  );
}

function Bars({ rows, color }: { rows: { label: string; count: number }[]; color: string }) {
  if (!rows.length) return <EmptyState title="אין נתונים" />;
  const max = Math.max(...rows.map((row) => row.count), 1);
  return (
    <div className="bars">
      {rows.slice(0, 8).map((row) => (
        <div className="bar-row" key={row.label}>
          <span className="bar-row__label" title={row.label}>{row.label}</span>
          <span className="bar-row__track">
            <span className="bar-row__fill"
                  style={{ width: `${(row.count / max) * 100}%`, background: color }} />
          </span>
          <span className="bar-row__value num">{row.count}</span>
        </div>
      ))}
    </div>
  );
}

/** A donut drawn with conic-gradient — no chart library, no extra bundle. */
function Donut({ segments }: { segments: { label: string; value: number }[] }) {
  const total = segments.reduce((sum, segment) => sum + segment.value, 0);
  if (total === 0) return <EmptyState title="אין נתונים" />;

  let cursor = 0;
  const stops = segments.map((segment, index) => {
    const start = (cursor / total) * 100;
    cursor += segment.value;
    const end = (cursor / total) * 100;
    return `${DONUT_COLORS[index % DONUT_COLORS.length]} ${start}% ${end}%`;
  });

  return (
    <div className="donut">
      <div
        role="img"
        aria-label={segments.map((s) => `${s.label}: ${s.value}`).join(', ')}
        style={{
          width: 108, height: 108, borderRadius: '50%',
          background: `conic-gradient(${stops.join(', ')})`,
          position: 'relative', flexShrink: 0,
        }}
      >
        <span style={{
          position: 'absolute', inset: 16, borderRadius: '50%',
          background: 'var(--surface)', display: 'grid', placeItems: 'center',
          fontWeight: 700, fontSize: 'var(--text-lg)',
        }}>
          {total}
        </span>
      </div>
      <div className="donut__legend">
        {segments.map((segment, index) => (
          <span className="donut__key" key={segment.label}>
            <span className="donut__swatch"
                  style={{ background: DONUT_COLORS[index % DONUT_COLORS.length] }} />
            <span>{segment.label}</span>
            <strong className="num">{segment.value}</strong>
          </span>
        ))}
      </div>
    </div>
  );
}
