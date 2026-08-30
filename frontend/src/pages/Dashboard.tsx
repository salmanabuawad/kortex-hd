import { Link, useNavigate } from 'react-router-dom';
import {
  AlertTriangle, ArrowLeft, CheckCircle2, Clock, Inbox, Plus, ShieldCheck, TrendingUp,
} from 'lucide-react';

import { get } from '../lib/api';
import { useAuth, isStaff } from '../lib/auth';
import { useAsync } from '../lib/hooks';
import { formatCurrency } from '../lib/format';
import { statusLabel } from '../lib/labels';
import type { DashboardData } from '../lib/types';
import {
  Card, CardHeader, EmptyState, ErrorState, PageHeader, SkeletonCards,
} from '../components/ui';
import { TicketTable } from '../components/tickets';

function Kpi({
  value, label, icon, tone, to,
}: {
  value: number | string; label: string; icon: React.ReactNode;
  tone: 'blue' | 'purple' | 'amber' | 'red' | 'green'; to?: string;
}) {
  const body = (
    <>
      <span className={`kpi__icon kpi__icon--${tone}`}>{icon}</span>
      <span className="grow">
        <span className="kpi__value num" style={{ display: 'block' }}>{value}</span>
        <span className="kpi__label">{label}</span>
      </span>
    </>
  );
  return to ? <Link className="kpi" to={to}>{body}</Link> : <div className="kpi">{body}</div>;
}

export default function Dashboard() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const { data, loading, error, reload } = useAsync<DashboardData>(
    () => get<DashboardData>('/dashboard'), []);

  const staff = isStaff(user);
  const firstName = user?.full_name.split(' ')[0] ?? '';

  if (error) return <ErrorState message={error} onRetry={reload} />;

  return (
    <>
      <PageHeader
        title={`שלום, ${firstName}`}
        subtitle={staff
          ? 'מה דורש את תשומת הלב שלך כרגע'
          : 'מצב הקריאות שפתחת'}
              />

      {loading || !data ? <SkeletonCards count={4} /> : (
        <>
          <div className="grid grid--4" style={{ marginBottom: 'var(--space-4)' }}>
            <Kpi
              value={data.kpis.open} label="קריאות פתוחות" tone="blue"
              icon={<Inbox />} to="/tickets?status=open"
            />
            {staff ? (
              <Kpi
                value={data.kpis.assigned_to_me} label="ממתינות לטיפולך" tone="purple"
                icon={<Clock />} to="/tickets?scope=mine"
              />
            ) : (
              <Kpi
                value={data.kpis.resolved_total} label="קריאות שנפתרו" tone="green"
                icon={<CheckCircle2 />}
              />
            )}
            <Kpi
              value={data.kpis.waiting_approval} label="ממתין לאישור" tone="amber"
              icon={<ShieldCheck />} to={staff ? '/approvals' : undefined}
            />
            <Kpi
              value={data.kpis.overdue} label="חריגה מזמן תקן" tone="red"
              icon={<AlertTriangle />} to="/tickets?sla=breached"
            />
          </div>

          {data.needs_attention.length > 0 && (
            <Card style={{ marginBottom: 'var(--space-4)' }}>
              <CardHeader
                title="דורש התייחסות עכשיו"
                icon={<AlertTriangle size={17} style={{ color: 'var(--warning-text)' }} />}
                action={
                  <Link to="/tickets?sla=breached" className="btn btn--ghost btn--sm">
                    הצגת הכל <ArrowLeft size={15} />
                  </Link>
                }
              />
              <div className="card__body card__body--flush">
                <TicketTable tickets={data.needs_attention} showResolver={staff} />
              </div>
            </Card>
          )}

          <div className="grid grid--2" style={{ marginBottom: 'var(--space-4)' }}>
            <Card>
              <CardHeader title="קריאות לפי סטטוס" />
              <div className="card__body">
                {data.by_status.length === 0 ? (
                  <EmptyState title="אין נתונים עדיין" />
                ) : (
                  <div className="bars">
                    {data.by_status.map((row) => {
                      const max = Math.max(...data.by_status.map((r) => r.count), 1);
                      return (
                        <div className="bar-row" key={row.status}>
                          <span className="bar-row__label">{statusLabel[row.status]}</span>
                          <span className="bar-row__track">
                            <span
                              className="bar-row__fill"
                              style={{ width: `${(row.count / max) * 100}%` }}
                            />
                          </span>
                          <span className="bar-row__value num">{row.count}</span>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            </Card>

            <Card>
              <CardHeader
                title="קריאות פתוחות לפי קטגוריה"
                action={data.sla_rate !== null ? (
                  <span className="chip chip--green">
                    <TrendingUp size={12} /> עמידה בתקן {data.sla_rate}%
                  </span>
                ) : undefined}
              />
              <div className="card__body">
                {data.by_category.length === 0 ? (
                  <EmptyState title="אין קריאות פתוחות" />
                ) : (
                  <div className="bars">
                    {data.by_category.map((row) => {
                      const max = Math.max(...data.by_category.map((r) => r.count), 1);
                      return (
                        <div className="bar-row" key={row.category}>
                          <span className="bar-row__label">{row.category}</span>
                          <span className="bar-row__track">
                            <span
                              className="bar-row__fill"
                              style={{
                                width: `${(row.count / max) * 100}%`,
                                background: 'var(--accent)',
                              }}
                            />
                          </span>
                          <span className="bar-row__value num">{row.count}</span>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            </Card>
          </div>

          {staff && data.approvals.length > 0 && (
            <Card style={{ marginBottom: 'var(--space-4)' }}>
              <CardHeader
                title="אישורים הממתינים לך"
                icon={<ShieldCheck size={17} style={{ color: 'var(--warning-text)' }} />}
                action={
                  <Link to="/approvals" className="btn btn--ghost btn--sm">
                    לכל האישורים <ArrowLeft size={15} />
                  </Link>
                }
              />
              <div className="card__body stack">
                {data.approvals.map((approval) => (
                  <button
                    key={approval.id}
                    className="work-item"
                    onClick={() => navigate(`/tickets/${approval.ticket_id}`)}
                  >
                    <span className="work-item__icon work-item__icon--external">
                      <ShieldCheck size={17} />
                    </span>
                    <span className="grow">
                      <span className="work-item__title" style={{ display: 'block' }}>
                        {approval.ticket_subject}
                      </span>
                      <span className="work-item__meta">
                        <span className="cell-number">{approval.ticket_number}</span>
                        <span>{approval.reason}</span>
                        {approval.amount !== null && (
                          <strong>{formatCurrency(approval.amount)}</strong>
                        )}
                      </span>
                    </span>
                    <ArrowLeft size={16} style={{ color: 'var(--text-muted)' }} />
                  </button>
                ))}
              </div>
            </Card>
          )}

          <Card>
            <CardHeader
              title={staff ? 'עודכנו לאחרונה' : 'הקריאות האחרונות שלך'}
              action={
                <Link to="/tickets" className="btn btn--ghost btn--sm">
                  לכל הקריאות <ArrowLeft size={15} />
                </Link>
              }
            />
            <div className="card__body card__body--flush">
              <TicketTable
                tickets={data.recent}
                showResolver={staff}
                emptyTitle="אין קריאות פתוחות"
                emptyText={staff
                  ? 'כל הקריאות טופלו. כשתיפתח קריאה חדשה היא תופיע כאן.'
                  : 'עדיין לא פתחת קריאות. אפשר לפתוח קריאה חדשה בכל עת.'}
                emptyAction={
                  <Link to="/tickets/new" className="btn btn--primary">
                    <Plus size={16} /> פתיחת קריאה
                  </Link>
                }
              />
            </div>
          </Card>
        </>
      )}
    </>
  );
}
