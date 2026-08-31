import { Link, useNavigate } from 'react-router-dom';
import {
  AlertTriangle, ArrowLeft, LayoutDashboard, Plus, ShieldCheck,
} from 'lucide-react';

import { get } from '../lib/api';
import { useAuth, isStaff } from '../lib/auth';
import { useAsync } from '../lib/hooks';
import { formatCurrency } from '../lib/format';
import type { DashboardData } from '../lib/types';
import {
  Button, Card, CardHeader, ErrorState, Skeleton,
} from '../components/ui';
import { PageFrame } from '../components/layout/Shell';
import { TicketQueue } from '../components/tickets';

function countOf(data: DashboardData, status: string) {
  return data.by_status.find((row) => row.status === status)?.count ?? 0;
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
    <PageFrame
      reading
      icon={<LayoutDashboard />}
      title={`שלום ${firstName}`}
      summary={staff
        ? 'הנה מה שדורש טיפול היום'
        : 'מצב הקריאות שפתחת'}
      actions={
        <Button variant="primary" icon={<Plus size={16} />} onClick={() => navigate('/tickets/new')}>
          פתיחת קריאה
        </Button>
      }
    >
      {loading || !data ? (
        <div className="stack">
          <Skeleton height={44} radius={10} />
          <Skeleton height={180} radius={12} />
        </div>
      ) : (
        <>
          <div className="ops" aria-label="סיכום תפעולי">
            {staff && (
              <Link className="ops__item" to="/tickets?scope=mine">
                <span className="ops__value num">{data.kpis.assigned_to_me}</span>
                <span className="ops__label">בטיפולי</span>
              </Link>
            )}
            <Link className="ops__item" to="/tickets?status=new">
              <span className="ops__value num">{countOf(data, 'new')}</span>
              <span className="ops__label">חדשות</span>
            </Link>
            <Link className="ops__item" to="/tickets?status=in_progress">
              <span className="ops__value num">{countOf(data, 'in_progress')}</span>
              <span className="ops__label">בטיפול</span>
            </Link>
            <Link className="ops__item ops__item--warn" to={staff ? '/approvals' : '/tickets'}>
              <span className="ops__value num">{data.kpis.waiting_approval}</span>
              <span className="ops__label">ממתינות</span>
            </Link>
            <Link className="ops__item ops__item--risk" to="/tickets?sla=breached">
              <span className="ops__value num">{data.kpis.overdue + data.kpis.at_risk}</span>
              <span className="ops__label">סיכון זמן תקן</span>
            </Link>
            {!staff && (
              <div className="ops__item">
                <span className="ops__value num">{data.kpis.resolved_total}</span>
                <span className="ops__label">נפתרו</span>
              </div>
            )}
          </div>

          <Card>
            <CardHeader
              title="דורש את תשומת לבך"
              icon={<AlertTriangle size={17} style={{ color: 'var(--warning-text)' }} />}
              action={
                <Link to="/tickets?sla=breached" className="btn btn--ghost btn--sm">
                  הצגת הכל <ArrowLeft className="dir-icon" size={15} />
                </Link>
              }
            />
            <div className="card__body">
              <TicketQueue
                tickets={data.needs_attention}
                showResolver={staff}
                emptyTitle="אין פריטים דחופים"
                emptyText="אין קריאות שחורגות מזמן התקן או שממתינות להחלטה שלך."
              />
            </div>
          </Card>

          {staff && data.approvals.length > 0 && (
            <Card>
              <CardHeader
                title="אישורים ממתינים"
                icon={<ShieldCheck size={17} style={{ color: 'var(--warning-text)' }} />}
                action={
                  <Link to="/approvals" className="btn btn--ghost btn--sm">
                    לכל האישורים <ArrowLeft className="dir-icon" size={15} />
                  </Link>
                }
              />
              <div className="card__body stack">
                {data.approvals.map((approval) => (
                  <button
                    key={approval.id}
                    type="button"
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
                    <ArrowLeft className="dir-icon" size={16} style={{ color: 'var(--text-muted)' }} />
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
                  לכל הקריאות <ArrowLeft className="dir-icon" size={15} />
                </Link>
              }
            />
            <div className="card__body">
              <TicketQueue
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
    </PageFrame>
  );
}
