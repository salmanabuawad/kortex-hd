import { useState, type FormEvent } from 'react';

import { get, post } from '../../lib/api';
import { useAction, useAsync } from '../../lib/hooks';
import { priorityLabel, channelLabel } from '../../lib/labels';
import type { Category, Priority, Subtask, UserBrief } from '../../lib/types';
import {
  Banner, Button, Dialog, SelectField, TextAreaField, TextField,
} from '../ui';

const PRIORITIES: Priority[] = ['low', 'normal', 'high', 'urgent'];

/* -------------------------------------------------------------------------- */
/* Transfer                                                                    */
/* -------------------------------------------------------------------------- */

export function TransferDialog({
  open, onClose, ticketId, currentCategoryId, onDone,
}: {
  open: boolean; onClose: () => void; ticketId: number;
  currentCategoryId: number | undefined; onDone: () => void;
}) {
  const [resolverId, setResolverId] = useState('');
  const [categoryId, setCategoryId] = useState('');
  const [reason, setReason] = useState('');
  const [error, setError] = useState('');
  const { busy, run } = useAction();

  const people = useAsync<{ items: UserBrief[] }>(
    () => (open ? get<{ items: UserBrief[] }>('/users/assignable')
      : Promise.resolve({ items: [] })), [open]);
  const categories = useAsync<{ items: Category[] }>(
    () => (open ? get<{ items: Category[] }>('/categories')
      : Promise.resolve({ items: [] })), [open]);

  const submit = (event: FormEvent) => {
    event.preventDefault();
    if (!resolverId) { setError('יש לבחור מטפל'); return; }
    if (!reason.trim()) { setError('יש לציין סיבת העברה'); return; }
    setError('');
    void run(
      () => post(`/tickets/${ticketId}/transfer`, {
        resolver_id: Number(resolverId),
        category_id: categoryId ? Number(categoryId) : null,
        reason: reason.trim(),
      }),
      {
        onSuccess: () => { onDone(); onClose(); setResolverId(''); setCategoryId(''); setReason(''); },
        onError: setError,
      },
    );
  };

  return (
    <Dialog
      open={open} onClose={onClose} title="העברת הקריאה לגורם אחר"
      footer={
        <>
          <Button variant="primary" loading={busy} onClick={submit as never} type="submit"
                  form="transfer-form">
            העברה
          </Button>
          <Button variant="ghost" onClick={onClose}>ביטול</Button>
        </>
      }
    >
      <form id="transfer-form" className="stack" onSubmit={submit}>
        {error && <Banner tone="danger">{error}</Banner>}

        <SelectField
          label="מטפל חדש" required value={resolverId}
          onChange={(event) => setResolverId(event.target.value)}
        >
          <option value="">בחרו מטפל…</option>
          {people.data?.items.map((person) => (
            <option key={person.id} value={person.id}>{person.name}</option>
          ))}
        </SelectField>

        <SelectField
          label="העברה לקטגוריה אחרת"
          hint="לא חובה. השאירו ריק כדי להשאיר את הקריאה בקטגוריה הנוכחית."
          value={categoryId}
          onChange={(event) => setCategoryId(event.target.value)}
        >
          <option value="">ללא שינוי קטגוריה</option>
          {categories.data?.items
            .filter((category) => category.id !== currentCategoryId)
            .map((category) => (
              <option key={category.id} value={category.id}>{category.name}</option>
            ))}
        </SelectField>

        <TextAreaField
          label="סיבת ההעברה" required value={reason}
          onChange={(event) => setReason(event.target.value)}
          placeholder="למשל: התקלה בתחום האחריות של מחלקת הנדסה"
          hint="הסיבה נשמרת בהיסטוריית הקריאה ונשלחת למטפל החדש"
        />

        <Banner tone="info">
          כל התגובות, הקבצים, המשימות והאישורים נשארים על הקריאה. רק הגורם המטפל משתנה.
        </Banner>
      </form>
    </Dialog>
  );
}

/* -------------------------------------------------------------------------- */
/* Create subtask                                                              */
/* -------------------------------------------------------------------------- */

export function SubtaskDialog({
  open, onClose, ticketId, onDone,
}: { open: boolean; onClose: () => void; ticketId: number; onDone: (created: Subtask) => void }) {
  const [assigneeType, setAssigneeType] = useState<'internal' | 'external'>('internal');
  const [assigneeUserId, setAssigneeUserId] = useState('');
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [priority, setPriority] = useState<Priority>('normal');
  const [dueDate, setDueDate] = useState('');
  const [name, setName] = useState('');
  const [org, setOrg] = useState('');
  const [email, setEmail] = useState('');
  const [phone, setPhone] = useState('');
  const [channel, setChannel] = useState<'email' | 'sms' | 'whatsapp'>('email');
  const [error, setError] = useState('');
  const { busy, run } = useAction();

  const people = useAsync<{ items: UserBrief[] }>(
    () => (open ? get<{ items: UserBrief[] }>('/users/assignable')
      : Promise.resolve({ items: [] })), [open]);

  const reset = () => {
    setTitle(''); setDescription(''); setDueDate(''); setAssigneeUserId('');
    setName(''); setOrg(''); setEmail(''); setPhone(''); setError('');
  };

  const submit = (event: FormEvent) => {
    event.preventDefault();
    if (title.trim().length < 2) { setError('יש להזין כותרת למשימה'); return; }
    if (assigneeType === 'internal' && !assigneeUserId) {
      setError('יש לבחור אחראי פנימי'); return;
    }
    if (assigneeType === 'external') {
      if (!name.trim()) { setError('יש להזין שם איש קשר'); return; }
      if (!email.trim() && !phone.trim()) {
        setError('יש להזין דוא״ל או טלפון ליצירת קשר'); return;
      }
    }
    setError('');
    void run(
      () => post<Subtask>(`/tickets/${ticketId}/subtasks`, {
        title: title.trim(),
        description: description.trim(),
        assignee_type: assigneeType,
        assignee_user_id: assigneeType === 'internal' ? Number(assigneeUserId) : null,
        external_name: assigneeType === 'external' ? name.trim() : null,
        external_org: assigneeType === 'external' ? (org.trim() || null) : null,
        external_email: assigneeType === 'external' ? (email.trim() || null) : null,
        external_phone: assigneeType === 'external' ? (phone.trim() || null) : null,
        external_channel: assigneeType === 'external' ? channel : null,
        due_date: dueDate || null,
        priority,
      }),
      {
        onSuccess: (created) => { onDone(created); onClose(); reset(); },
        onError: setError,
      },
    );
  };

  return (
    <Dialog
      open={open} onClose={onClose} title="משימת משנה חדשה" wide
      footer={
        <>
          <Button variant="primary" loading={busy} type="submit" form="subtask-form">
            יצירת המשימה
          </Button>
          <Button variant="ghost" onClick={onClose}>ביטול</Button>
        </>
      }
    >
      <form id="subtask-form" className="stack" onSubmit={submit}>
        {error && <Banner tone="danger">{error}</Banner>}

        <TextField
          label="כותרת המשימה" required value={title}
          onChange={(event) => setTitle(event.target.value)}
          placeholder="למשל: בדיקת יחידת ההקלטה על ידי הספק"
        />
        <TextAreaField
          label="תיאור" value={description}
          onChange={(event) => setDescription(event.target.value)}
          placeholder="מה בדיוק נדרש מהאחראי על המשימה"
        />

        <div className="field">
          <span className="field__label">מי מבצע את המשימה?</span>
          <div className="segmented" role="group" aria-label="סוג האחראי">
            <button
              type="button" aria-pressed={assigneeType === 'internal'}
              onClick={() => setAssigneeType('internal')}
            >
              עובד מועצה
            </button>
            <button
              type="button" aria-pressed={assigneeType === 'external'}
              onClick={() => setAssigneeType('external')}
            >
              גורם חיצוני / ספק
            </button>
          </div>
        </div>

        {assigneeType === 'internal' ? (
          <SelectField
            label="אחראי" required value={assigneeUserId}
            onChange={(event) => setAssigneeUserId(event.target.value)}
          >
            <option value="">בחרו עובד…</option>
            {people.data?.items.map((person) => (
              <option key={person.id} value={person.id}>{person.name}</option>
            ))}
          </SelectField>
        ) : (
          <>
            <div className="grid grid--2">
              <TextField
                label="שם איש הקשר" required value={name}
                onChange={(event) => setName(event.target.value)}
              />
              <TextField
                label="ארגון / חברה" value={org}
                onChange={(event) => setOrg(event.target.value)}
              />
            </div>
            <div className="grid grid--2">
              <TextField
                label="דוא״ל" type="email" dir="ltr" className="input ltr" value={email}
                onChange={(event) => setEmail(event.target.value)}
              />
              <TextField
                label="טלפון" type="tel" dir="ltr" className="input ltr" value={phone}
                onChange={(event) => setPhone(event.target.value)}
              />
            </div>
            <SelectField
              label="ערוץ שליחת הקישור" value={channel}
              hint="הגורם החיצוני יקבל קישור אישי למשימה זו בלבד"
              onChange={(event) => setChannel(event.target.value as typeof channel)}
            >
              {(['email', 'sms', 'whatsapp'] as const).map((value) => (
                <option key={value} value={value}>{channelLabel[value]}</option>
              ))}
            </SelectField>
            <Banner tone="info">
              הקישור מוגבל למשימה זו בלבד, אינו חושף מידע פנימי מהקריאה,
              ומפסיק לפעול ברגע שהמשימה מסומנת כהושלמה.
            </Banner>
          </>
        )}

        <div className="grid grid--2">
          <SelectField
            label="דחיפות" value={priority}
            onChange={(event) => setPriority(event.target.value as Priority)}
          >
            {PRIORITIES.map((value) => (
              <option key={value} value={value}>{priorityLabel[value]}</option>
            ))}
          </SelectField>
          <TextField
            label="תאריך יעד" type="date" value={dueDate}
            onChange={(event) => setDueDate(event.target.value)}
          />
        </div>
      </form>
    </Dialog>
  );
}

/* -------------------------------------------------------------------------- */
/* Resolve / reject / reopen / request approval                                */
/* -------------------------------------------------------------------------- */

export function NoteDialog({
  open, onClose, title, label, placeholder, confirmLabel, tone = 'primary',
  banner, onSubmit,
}: {
  open: boolean; onClose: () => void; title: string; label: string;
  placeholder?: string; confirmLabel: string;
  tone?: 'primary' | 'success' | 'danger';
  banner?: { tone: 'info' | 'warning' | 'danger'; text: string };
  onSubmit: (note: string) => Promise<unknown>;
}) {
  const [note, setNote] = useState('');
  const [error, setError] = useState('');
  const { busy, run } = useAction();

  const submit = (event: FormEvent) => {
    event.preventDefault();
    if (!note.trim()) { setError('יש להזין טקסט'); return; }
    setError('');
    void run(() => onSubmit(note.trim()), {
      onSuccess: () => { onClose(); setNote(''); },
      onError: setError,
    });
  };

  return (
    <Dialog
      open={open} onClose={onClose} title={title}
      footer={
        <>
          <Button variant={tone} loading={busy} type="submit" form="note-form">
            {confirmLabel}
          </Button>
          <Button variant="ghost" onClick={onClose}>ביטול</Button>
        </>
      }
    >
      <form id="note-form" className="stack" onSubmit={submit}>
        {error && <Banner tone="danger">{error}</Banner>}
        {banner && <Banner tone={banner.tone}>{banner.text}</Banner>}
        <TextAreaField
          label={label} required value={note} placeholder={placeholder}
          onChange={(event) => setNote(event.target.value)}
        />
      </form>
    </Dialog>
  );
}

export function ApprovalRequestDialog({
  open, onClose, ticketId, defaultApproverId, onDone,
}: {
  open: boolean; onClose: () => void; ticketId: number;
  defaultApproverId?: number | null; onDone: () => void;
}) {
  const [approverId, setApproverId] = useState(String(defaultApproverId ?? ''));
  const [reason, setReason] = useState('');
  const [error, setError] = useState('');
  const { busy, run } = useAction();

  const people = useAsync<{ items: UserBrief[] }>(
    () => (open ? get<{ items: UserBrief[] }>('/users/assignable')
      : Promise.resolve({ items: [] })), [open]);

  const submit = (event: FormEvent) => {
    event.preventDefault();
    if (!reason.trim()) { setError('יש לפרט את סיבת הבקשה'); return; }
    setError('');
    void run(
      () => post(`/tickets/${ticketId}/approvals`, {
        reason: reason.trim(),
        approver_id: approverId ? Number(approverId) : null,
      }),
      { onSuccess: () => { onDone(); onClose(); setReason(''); }, onError: setError },
    );
  };

  return (
    <Dialog
      open={open} onClose={onClose} title="בקשת אישור"
      footer={
        <>
          <Button variant="primary" loading={busy} type="submit" form="approval-form">
            שליחת הבקשה
          </Button>
          <Button variant="ghost" onClick={onClose}>ביטול</Button>
        </>
      }
    >
      <form id="approval-form" className="stack" onSubmit={submit}>
        {error && <Banner tone="danger">{error}</Banner>}
        <SelectField
          label="מאשר" value={approverId}
          hint="אם לא נבחר מאשר, הבקשה תופנה לגורם המאשר שהוגדר בקטגוריה"
          onChange={(event) => setApproverId(event.target.value)}
        >
          <option value="">לפי הגדרת הקטגוריה</option>
          {people.data?.items.map((person) => (
            <option key={person.id} value={person.id}>{person.name}</option>
          ))}
        </SelectField>
        <TextAreaField
          label="סיבת הבקשה" required value={reason}
          onChange={(event) => setReason(event.target.value)}
          placeholder="למשל: נדרשת רכישת רכיב חלופי בעלות חריגה"
        />
        <Banner tone="warning">
          כל עוד קיימת בקשת אישור פתוחה, לא ניתן לסגור את הקריאה.
        </Banner>
      </form>
    </Dialog>
  );
}
