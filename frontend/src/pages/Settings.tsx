import { useEffect, useState } from 'react';
import {
  Bell, Building2, Clock, Cog, Mail, Puzzle, Save, Send, ShieldCheck, Tags,
} from 'lucide-react';

import { get, patch, post, put } from '../lib/api';
import { useAsync } from '../lib/hooks';
import type { RequestType } from '../lib/types';
import {
  Banner, Button, Card, CardHeader, Chip, ErrorState, SelectField, SkeletonRows, Switch,
  Tabs, TextField, type TabSpec,
} from '../components/ui';
import { PageFrame } from '../components/layout/Shell';
import { useToast } from '../components/ui/toast';

type Groups = Record<string, Record<string, string | null>>;

const TABS: TabSpec[] = [
  { id: 'general', label: 'כללי', icon: <Building2 size={15} /> },
  { id: 'types', label: 'סוגי בקשה', icon: <Tags size={15} /> },
  { id: 'sla', label: 'זמני תקן', icon: <Clock size={15} /> },
  { id: 'mail', label: 'דואר אלקטרוני', icon: <Mail size={15} /> },
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
    { key: 'sla.hours_urgent', label: 'דחופה — זמן תקן (שעות)', type: 'number',
      hint: 'ברירת מחדל: שעתיים' },
    { key: 'sla.hours_high', label: 'גבוהה — זמן תקן (שעות)', type: 'number',
      hint: 'ברירת מחדל: 24 שעות (יום)' },
    { key: 'sla.hours_normal', label: 'רגילה — זמן תקן (שעות)', type: 'number',
      hint: 'ברירת מחדל: 72 שעות (שלושה ימים)' },
    { key: 'sla.hours_low', label: 'נמוכה — זמן תקן (שעות)', type: 'number',
      hint: 'ברירת מחדל: 168 שעות (שבוע)' },
    { key: 'sla.warning_fraction', label: 'סף התראה מוקדמת',
      hint: 'חלק מזמן התקן שאחריו הקריאה מסומנת "בסיכון". 0.75 = 75%' },
    { key: 'sla.default_hours', label: 'זמן תקן ברירת מחדל (שעות)', type: 'number',
      hint: 'שמור לתאימות. זמן התקן נקבע לפי הדחיפות שלמעלה.' },
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
    <PageFrame
      reading
      icon={<Cog />}
      title="הגדרות מערכת"
        summary="הגדרות כלליות, זמני תקן, התראות ואבטחה"
        actions={
          dirty ? (
            <Button variant="primary" icon={<Save size={16} />} loading={saving}
                    onClick={() => void save()}>
              שמירת שינויים
            </Button>
          ) : undefined
        }
    >

      <Tabs tabs={TABS} active={tab} onChange={setTab} />

      {settings.loading ? <SkeletonRows rows={4} /> : (
        <div className="settings-panel">
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

          {tab === 'mail' && (
            <MailSettings values={values} onChange={update} dirty={dirty} />
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
    </PageFrame>
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
      <CardHeader title="ממשקים חיצוניים" icon={<Puzzle size={17} />} />
      <div className="card__body stack">
        <Banner tone="info" title="דואר אלקטרוני מוגדר כאן במערכת">
          הגדרות שרת הדואר היוצא — שרת, פורט, שם משתמש וסיסמה — נמצאות בלשונית
          "דואר אלקטרוני", כולל שליחת הודעת בדיקה. אין צורך לערוך קבצים בשרת.
        </Banner>
        <p className="cell-meta">
          מסרונים ווואטסאפ עדיין פועלים במצב יומן בלבד: כל הודעה נרשמת עם הנמען
          והתוכן אך אינה נשלחת. הפעלתם דורשת הגדרת ספק בקובץ backend/.env והפעלה
          מחדש של השירות.
        </p>
      </div>
    </Card>
  );
}

/** Outgoing mail, editable in the application rather than in backend/.env.
 *
 *  The password is write-only: the server sends back a mask, the mask is saved
 *  back unchanged, and only something actually typed replaces the stored value.
 *  The test button exists because configuration that has never delivered
 *  anything is a guess -- it reports the SMTP server's own error verbatim,
 *  which is what makes a wrong port or a disabled SMTP AUTH diagnosable.
 */
function MailSettings({
  values, onChange, dirty,
}: {
  values: Record<string, string>;
  onChange: (key: string, value: string) => void;
  dirty: boolean;
}) {
  const toast = useToast();
  const [testing, setTesting] = useState(false);
  const [testTo, setTestTo] = useState('');
  const [result, setResult] = useState<{ ok: boolean; text: string } | null>(null);

  const provider = values['mail.provider'] ?? 'log';
  const passwordSet = values['mail.password_set'] === 'true';

  const sendTest = async () => {
    setTesting(true);
    setResult(null);
    try {
      const response = await post<{ ok: boolean; error?: string; recipient: string }>(
        '/settings/mail/test', { to: testTo.trim() || null });
      if (response.ok) {
        setResult({ ok: true, text: `נשלחה הודעת בדיקה אל ${response.recipient}` });
        toast.success('הודעת הבדיקה נשלחה');
      } else {
        setResult({ ok: false, text: response.error ?? 'השליחה נכשלה' });
      }
    } catch (error) {
      setResult({ ok: false, text: error instanceof Error ? error.message : 'השליחה נכשלה' });
    } finally {
      setTesting(false);
    }
  };

  return (
    <>
      <Card>
        <CardHeader title="שרת דואר יוצא" icon={<Mail size={17} />} />
        <div className="card__body stack">
          <SelectField
            label="אופן שליחה"
            value={provider}
            hint={provider === 'log'
              ? 'כרגע ההודעות נרשמות ביומן בלבד ואינן נשלחות בפועל'
              : 'ההודעות נשלחות דרך שרת ה־SMTP שמוגדר כאן'}
            onChange={(event) => onChange('mail.provider', event.target.value)}
          >
            <option value="log">יומן בלבד (ללא שליחה)</option>
            <option value="smtp">שליחה דרך SMTP</option>
          </SelectField>

          <div className="grid grid--3">
            <TextField
              label="שרת SMTP" placeholder="smtp.office365.com"
              value={values['mail.host'] ?? ''}
              onChange={(event) => onChange('mail.host', event.target.value)}
            />
            <TextField
              label="פורט" type="number" placeholder="587"
              value={values['mail.port'] ?? ''}
              onChange={(event) => onChange('mail.port', event.target.value)}
            />
            <SelectField
              label="הצפנה"
              value={values['mail.security'] ?? 'auto'}
              onChange={(event) => onChange('mail.security', event.target.value)}
            >
              <option value="auto">אוטומטי לפי הפורט</option>
              <option value="starttls">STARTTLS (587)</option>
              <option value="ssl">SSL/TLS (465)</option>
            </SelectField>
          </div>

          <div className="grid grid--2">
            <TextField
              label="שם משתמש" type="email" placeholder="support@buqata.muni.il"
              autoComplete="username"
              value={values['mail.username'] ?? ''}
              onChange={(event) => onChange('mail.username', event.target.value)}
            />
            <TextField
              label="סיסמה" type="password" autoComplete="new-password"
              hint={passwordSet
                ? 'סיסמה שמורה. השאירו ריק כדי לא לשנות אותה.'
                : 'עבור תיבה עם אימות דו־שלבי יש להזין סיסמת יישום (App password).'}
              placeholder={passwordSet ? '••••••••' : ''}
              value={values['mail.password'] ?? ''}
              onChange={(event) => onChange('mail.password', event.target.value)}
            />
          </div>

          <div className="grid grid--3">
            <TextField
              label="כתובת השולח" type="email" placeholder="support@buqata.muni.il"
              value={values['mail.from_address'] ?? ''}
              onChange={(event) => onChange('mail.from_address', event.target.value)}
            />
            <TextField
              label="שם השולח"
              value={values['mail.from_name'] ?? ''}
              onChange={(event) => onChange('mail.from_name', event.target.value)}
            />
            <TextField
              label="תיבת המוקד" type="email" placeholder="support@buqata.muni.il"
              hint="מקבלת עותק מכל פעולה בקריאה, ומשמשת ככתובת להשבה"
              value={values['mail.support_inbox'] ?? ''}
              onChange={(event) => onChange('mail.support_inbox', event.target.value)}
            />
          </div>
        </div>
      </Card>

      <Card>
        <CardHeader title="בדיקת שליחה" icon={<Send size={17} />} />
        <div className="card__body stack">
          {dirty && (
            <Banner tone="warning" title="יש שינויים שלא נשמרו">
              הבדיקה משתמשת בהגדרות השמורות. שמרו קודם כדי לבדוק את מה שהוזן כעת.
            </Banner>
          )}
          <div className="grid grid--2">
            <TextField
              label="לכתובת" type="email"
              hint="ברירת מחדל: תיבת המוקד"
              value={testTo}
              onChange={(event) => setTestTo(event.target.value)}
            />
            <div style={{ display: 'flex', alignItems: 'flex-end' }}>
              <Button variant="primary" icon={<Send size={16} />} loading={testing}
                      onClick={() => void sendTest()}>
                שליחת הודעת בדיקה
              </Button>
            </div>
          </div>

          {result && (
            <Banner tone={result.ok ? 'success' : 'danger'}
                    title={result.ok ? 'השליחה הצליחה' : 'השליחה נכשלה'}>
              {result.text}
            </Banner>
          )}
        </div>
      </Card>
    </>
  );
}
