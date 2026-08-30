import { AlertTriangle, CheckCircle2, RefreshCw, XCircle } from 'lucide-react';

import { get } from '../lib/api';
import { useAsync } from '../lib/hooks';
import { formatDateTime, relativeTime } from '../lib/format';
import { channelLabel } from '../lib/labels';
import type { HealthComponent } from '../lib/types';
import {
  Button, Card, CardHeader, Chip, EmptyState, ErrorState, PageHeader, SkeletonRows,
} from '../components/ui';

interface HealthData {
  components: HealthComponent[];
  counts: Record<string, number>;
  generated_at: string;
}

interface Delivery {
  id: number; channel: string; recipient: string; subject: string | null;
  status: string; provider: string | null; error: string | null; created_at: string;
}

const STATE_ICON = {
  ok: <CheckCircle2 />,
  warning: <AlertTriangle />,
  error: <XCircle />,
};

const STATE_TONE = { ok: 'green', warning: 'amber', error: 'red' } as const;
const STATE_LABEL = { ok: 'תקין', warning: 'שים לב', error: 'תקלה' };

export default function Health() {
  const health = useAsync<HealthData>(() => get<HealthData>('/system/health'), []);
  const deliveries = useAsync<{ items: Delivery[] }>(
    () => get<{ items: Delivery[] }>('/notifications/deliveries?limit=25'), []);

  if (health.error) return <ErrorState message={health.error} onRetry={health.reload} />;

  return (
    <>
      <PageHeader
        title="תקינות המערכת"
        subtitle={health.data
          ? `נבדק ${formatDateTime(health.data.generated_at)}`
          : 'בדיקת רכיבי המערכת'}
        actions={
          <Button icon={<RefreshCw size={16} />}
                  onClick={() => { health.reload(); deliveries.reload(); }}>
            רענון
          </Button>
        }
      />

      {health.loading || !health.data ? <SkeletonRows rows={5} /> : (
        <>
          <div className="grid grid--3" style={{ marginBottom: 'var(--space-4)' }}>
            {health.data.components.map((component) => (
              <Card key={component.key}>
                <div className="kpi" style={{ border: 'none', boxShadow: 'none' }}>
                  <span className={`kpi__icon kpi__icon--${STATE_TONE[component.state]}`}>
                    {STATE_ICON[component.state]}
                  </span>
                  <span className="grow">
                    <span className="row" style={{ gap: 'var(--space-2)' }}>
                      <strong>{component.label}</strong>
                      <Chip tone={STATE_TONE[component.state]} dot>
                        {STATE_LABEL[component.state]}
                      </Chip>
                    </span>
                    <span className="cell-meta" style={{ display: 'block', marginTop: 2 }}>
                      {component.detail}
                    </span>
                    {component.degraded && (
                      <span className="cell-meta" style={{ display: 'block', marginTop: 4 }}>
                        פועל במצב יומן — הודעות נרשמות ואינן נשלחות בפועל.
                      </span>
                    )}
                  </span>
                </div>
              </Card>
            ))}
          </div>

          <div className="grid grid--2">
            <Card>
              <CardHeader title="נתוני מערכת" />
              <div className="card__body meta-block">
                {Object.entries(health.data.counts).map(([key, value]) => (
                  <div className="meta-row" key={key}>
                    <span className="meta-row__label">
                      {{
                        users: 'משתמשים', tickets: 'קריאות',
                        categories: 'קטגוריות', audit_events: 'רשומות היסטוריה',
                      }[key] ?? key}
                    </span>
                    <span className="meta-row__value num">{value}</span>
                  </div>
                ))}
              </div>
            </Card>

            <Card>
              <CardHeader title="מסירות התראה אחרונות" />
              <div className="card__body card__body--flush">
                {deliveries.loading ? <SkeletonRows rows={4} />
                  : (deliveries.data?.items.length ?? 0) === 0 ? (
                    <EmptyState title="לא נשלחו התראות" />
                  ) : (
                    <div style={{ maxHeight: 380, overflowY: 'auto' }}>
                      {deliveries.data?.items.map((delivery) => (
                        <div className="skeleton-row" key={delivery.id}
                             style={{ borderBottom: '1px solid var(--border)' }}>
                          <Chip
                            tone={delivery.status === 'sent' ? 'green'
                              : delivery.status === 'failed' ? 'red' : 'neutral'}
                            dot
                          >
                            {delivery.status === 'sent' ? 'נשלח'
                              : delivery.status === 'failed' ? 'נכשל' : 'דולג'}
                          </Chip>
                          <div className="grow" style={{ minWidth: 0 }}>
                            <div style={{ fontSize: 'var(--text-sm)', fontWeight: 600 }}>
                              {delivery.subject ?? '—'}
                            </div>
                            <div className="cell-meta">
                              {channelLabel[delivery.channel as 'email'] ?? delivery.channel}
                              {' · '}
                              <span className="ltr">{delivery.recipient || '—'}</span>
                              {delivery.error && ` · ${delivery.error}`}
                            </div>
                          </div>
                          <span className="cell-meta">{relativeTime(delivery.created_at)}</span>
                        </div>
                      ))}
                    </div>
                  )}
              </div>
            </Card>
          </div>
        </>
      )}
    </>
  );
}
