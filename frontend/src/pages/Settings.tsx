import { useEffect, useState } from 'react';
import { Bell, Building2, Clock, Puzzle, Save, ShieldCheck, SlidersHorizontal, Tags } from 'lucide-react';

import { get, patch, put } from '../lib/api';
import { useAsync } from '../lib/hooks';
import type { RequestType } from '../lib/types';
import {
  Banner, Button, Card, CardHeader, Chip, ErrorState, PageHeader, SkeletonRows, Switch,
  Tabs, TextField, type TabSpec,
} from '../components/ui';
import { useToast } from '../components/ui/toast';

type Groups = Record<string, Record<string, string | null>>;

const TABS: TabSpec[] = [
  { id: 'general', label: 'כללי', icon: <Building2 size={15} /> },
  { id: 'types', label: 'סוגי בקשה', icon: <Tags size={15} /> },
  { id: 'sla', label: 'זמני תקן', icon: <Clock size={15} /> },
  { id: 'notifications', label: 'התראות', icon: <Bell size={15} /> },
  { id: 'security', label: 'אבטחה', icon: <ShieldCheck size={15} /> },
  { id: 'integrations', label: 'ממשקים', icon: <Puzzle size={15} /> },
];

const FIELDS: Record<string, { key: string; label: string; hint?: string; type?: string }[]> = {
  general: [
    { key: 'council.name', label: 'שם הרשות' },
    { key: 'council.support_email', label: 'כתובת מוקד השירות', type: 'email' },
    { key: 'tickets.allow_requester_priority', label: 'הפונה רשאי לקבוע דחיפות',
      hint: 'true / false' },
  ],
  sla: [
    { key: 'sla.default_hours', label: 'זמן תקן ברירת מחדל (שעות)', type: 'number',
      hint: 'משמש כשלא הוגדר זמן תקן בקטגוריה' },
    { key: 'sla.warning_fraction', label: 'סף התראה מוקדמת',
      hint: 'חלק מזמן התקן שאחריו הקריאה מסומנת "בסיכון". 0.75 = 75%' },
  ],
  security: [
    { key: 'security.password_min_length', label: 'אורך סיסמה מזערי', type: 'number' },
    { key: 'security.session_hours', label: 'תוקף התחברות (שעות)', type: 'number' },
  ],
};

export default function Settings() {
  const toast = useToast();
  const [tab, setTab] = useState('general');
  const [values, setValues] = useState<Record<string, string>>({});
  const [dirty, setDirty] = useState(false);
  const [saving, setSaving] = useState(false);

  const settings = useAsync<{ groups: Groups }>(() => get<{ groups: Groups }>('/settings'), []);
  const types = useAsync<{ items: RequestType[] }>(
    () => get<{ items: RequestType[] }>('/request-types'), []);

  useEffect(() => {
    if (!settings.data) return;
    const flat: Record<string, string> = {};
    Object.values(settings.data.groups).forEach((group) => {
      Object.entries(group).forEach(([key, value]) => { flat[key] = value ?? ''; });
    });
    setValues(flat);
    setDirty(false);
  }, [settings.data]);

  const update = (key: string, value: string) => {
    setValues((current) => ({ ...current, [key]: value }));
    setDirty(true);
  };

  const save = async () => {
    setSaving(true);
    try {
      await put('/settings', { values });
      toast.success('ההגדרות נשמרו');
      setDirty(false);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'השמירה נכשלה');
    } finally {
      setSaving(false);
    }
  };

  if (settings.error) return <ErrorState message={settings.error} onRetry={settings.reload} />;

  const fields = FIELDS[tab];

  return (
    <>
      <PageHeader
        title="הגדרות מערכת"
        subtitle="הגדרות כלליות, זמני תקן, התראות ואבטחה"
        actions={
          dirty ? (
            <Button variant="primary" icon={<Save size={16} />} loading={saving}
                    onClick={() => void save()}>
              שמירת שינויים
            </Button>
          ) : undefined
        }
      />

      <Tabs tabs={TABS} active={tab} onChange={setTab} />

      {settings.loading ? <SkeletonRows rows={4} /> : (
        <div style={{ maxWidth: 720 }}>
          {fields && (
            <Card>
              <CardHeader title={TABS.find((t) => t.id === tab)?.label ?? ''} />
              <div className="card__body stack">
                {fields.map((field) => (
                  <TextField
                    key={field.key}
                    label={field.label}
                    hint={field.hint}
                    type={field.type ?? 'text'}
                    value={values[field.key] ?? ''}
                    onChange={(event) => update(field.key, event.target.value)}
                  />
                ))}
              </div>
            </Card>
          )}

          {tab === 'notifications' && (
            <NotificationSettings values={values} onChange={update} />
          )}

          {tab === 'types' && (
            <RequestTypeSettings
              types={types.data?.items ?? []}
              loading={types.loading}
              onChanged={types.reload}
            />
          )}

          {tab === 'integrations' && <Integrations />}
        </div>
      )}
    </>
  );
}

function NotificationSettings({
  values, onChange,
}: { values: Record<string, string>; onChange: (key: string, value: string) => void }) {
  const channels = [
    { key: 'notifications.email_enabled', label: 'דואר אלקטרוני',
      hint: 'עדכוני קריאות, אישורים וקישורים לספקים' },
    { key: 'notifications.sms_enabled', label: 'מסרונים',
      hint: 'דורש הגדרת ספק מסרונים בקובץ הסביבה' },
    { key: 'notifications.whatsapp_enabled', label: 'וואטסאפ',
      hint: 'דורש הגדרת ספק וואטסאפ בקובץ הסביבה' },
  ];

  return (
    <div className="stack">
      <Banner tone="info">
        ערוצי המסירה בפועל נקבעים בקובץ הסביבה של השרת. כל עוד לא הוגדר ספק אמיתי,
        ההודעות נרשמות ביומן המערכת ואינן נשלחות — ניתן לראות אותן בעמוד תקינות המערכת.
      </Banner>
      <Card>
        <CardHeader title="ערוצי התראה" />
        <div className="card__body stack">
          {channels.map((channel) => (
            <div className="row" key={channel.key}>
              <Switch
                checked={values[channel.key] === 'true'}
                label={channel.label}
                onChange={(next) => onChange(channel.key, next ? 'true' : 'false')}
              />
              <div className="grow">
                <div style={{ fontWeight: 600 }}>{channel.label}</div>
                <div className="cell-meta">{channel.hint}</div>
              </div>
            </div>
          ))}
        </div>
      </Card>
    </div>
  );
}

function RequestTypeSettings({
  types, loading, onChanged,
}: { types: RequestType[]; loading: boolean; onChanged: () => void }) {
  const toast = useToast();

  const toggle = async (type: RequestType) => {
    try {
      await patch(`/request-types/${type.id}`, {
        key: type.key, name: type.name, description: type.description, icon: type.icon,
        requires_approval_default: type.requires_approval_default,
        active: !type.active, sort_order: type.sort_order,
      });
      onChanged();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'העדכון נכשל');
    }
  };

  if (loading) return <SkeletonRows rows={2} />;

  return (
    <Card>
      <CardHeader title="סוגי בקשה" />
      <div className="card__body stack">
        <p className="cell-meta">
          סוגי הבקשה נבחרים על ידי הפונה ומשפיעים על כללי האישור. ניתן לשייך אותם
          לקטגוריות בעמוד הקטגוריות.
        </p>
        {types.map((type) => (
          <div className="row" key={type.id}>
            <Switch checked={type.active} label={type.name}
                    onChange={() => void toggle(type)} />
            <div className="grow">
              <div className="row" style={{ gap: 'var(--space-2)' }}>
                <strong>{type.name}</strong>
                <span className="cell-number">{type.key}</span>
                {type.requires_approval_default && <Chip tone="amber">אישור כברירת מחדל</Chip>}
              </div>
              {type.description && <div className="cell-meta">{type.description}</div>}
            </div>
          </div>
        ))}
      </div>
    </Card>
  );
}

function Integrations() {
  return (
    <Card>
      <CardHeader title="ממשקים חיצוניים" icon={<SlidersHorizontal size={17} />} />
      <div className="card__body stack">
        <Banner tone="warning" title="לא הוגדרו ספקים">
          המערכת בנויה עם שכבת ספקים מופשטת עבור דואר, מסרונים ווואטסאפ. כרגע פעיל
          מצב יומן בלבד: כל הודעה נרשמת עם הנמען והתוכן, אך אינה נשלחת בפועל.
        </Banner>
        <p className="cell-meta">
          כדי להפעיל ספק אמיתי, הגדירו את משתני הסביבה המתאימים בקובץ backend/.env
          (למשל EMAIL_PROVIDER=smtp יחד עם פרטי שרת ה-SMTP) והפעילו מחדש את השירות.
        </p>
      </div>
    </Card>
  );
}
