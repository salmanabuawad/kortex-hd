import { useMemo, useState, type FormEvent } from 'react';
import {
  KeyRound, Mail, Pencil, Phone, Plus, Search, UserCheck, UserX, Users,
} from 'lucide-react';

import { get, patch, post } from '../lib/api';
import { useAuth } from '../lib/auth';
import { useAction, useAsync, useDebounced } from '../lib/hooks';
import { relativeTime } from '../lib/format';
import { roleLabel, roleTone } from '../lib/labels';
import type { Department, Role, User } from '../lib/types';
import {
  Avatar, Banner, Button, Card, Chip, Dialog, EmptyState, ErrorState, SelectField, SkeletonRows, TextField,
} from '../components/ui';
import { PageFrame } from '../components/layout/Shell';
import { useToast } from '../components/ui/toast';

const ROLES: Role[] = ['requester', 'resolver', 'approver', 'admin'];

export default function Directory() {
  const { user: me } = useAuth();
  const toast = useToast();

  const [search, setSearch] = useState('');
  const debounced = useDebounced(search, 300);
  const [role, setRole] = useState('');
  const [departmentId, setDepartmentId] = useState('');
  const [status, setStatus] = useState('');

  const [creating, setCreating] = useState(false);
  const [editing, setEditing] = useState<User | null>(null);
  const [resetting, setResetting] = useState<User | null>(null);

  const query = useMemo(() => {
    const params = new URLSearchParams();
    if (debounced.trim()) params.set('q', debounced.trim());
    if (role) params.set('role', role);
    if (departmentId) params.set('department_id', departmentId);
    if (status) params.set('active', status === 'active' ? 'true' : 'false');
    return params.toString();
  }, [debounced, role, departmentId, status]);

  const users = useAsync<{ items: User[] }>(
    () => get<{ items: User[] }>(`/users?${query}`), [query]);
  const departments = useAsync<{ items: Department[] }>(
    () => get<{ items: Department[] }>('/departments'), []);

  const toggleActive = async (person: User) => {
    try {
      await patch(`/users/${person.id}`, { active: !person.active });
      toast.success(person.active ? 'המשתמש הושבת' : 'המשתמש הופעל');
      users.reload();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'הפעולה נכשלה');
    }
  };

  return (
    <PageFrame
      reading
      icon={<Users />}
      title="משתמשים ואנשי קשר"
        summary="רק משתמשים רשומים ופעילים יכולים להתחבר ולפתוח קריאות"
        actions={
          <Button variant="primary" icon={<Plus size={16} />} onClick={() => setCreating(true)}>
            משתמש חדש
          </Button>
        }
    >

      <div className="toolbar">
        <div className="toolbar__search">
          <Search aria-hidden />
          <input
            type="search" value={search} aria-label="חיפוש משתמשים"
            placeholder="חיפוש לפי שם או דוא״ל…"
            onChange={(event) => setSearch(event.target.value)}
          />
        </div>
        <select className="select" value={role} aria-label="סינון לפי תפקיד"
                onChange={(event) => setRole(event.target.value)}>
          <option value="">כל התפקידים</option>
          {ROLES.map((value) => (
            <option key={value} value={value}>{roleLabel[value]}</option>
          ))}
        </select>
        <select className="select" value={departmentId} aria-label="סינון לפי מחלקה"
                onChange={(event) => setDepartmentId(event.target.value)}>
          <option value="">כל המחלקות</option>
          {departments.data?.items.map((department) => (
            <option key={department.id} value={department.id}>{department.name}</option>
          ))}
        </select>
        <select className="select" value={status} aria-label="סינון לפי מצב"
                onChange={(event) => setStatus(event.target.value)}>
          <option value="">פעילים ולא פעילים</option>
          <option value="active">פעילים</option>
          <option value="inactive">לא פעילים</option>
        </select>
      </div>

      {users.error ? (
        <ErrorState message={users.error} onRetry={users.reload} />
      ) : (
        <Card>
          <div className="card__body card__body--flush">
            {users.loading ? <SkeletonRows rows={6} /> : (users.data?.items.length ?? 0) === 0 ? (
              <EmptyState title="לא נמצאו משתמשים" text="נסו לשנות את הסינון." />
            ) : (
              <div>
                {users.data?.items.map((person) => (
                  <div className="person-card" key={person.id}
                       style={{ borderBottom: '1px solid var(--border)',
                                opacity: person.active ? 1 : 0.6 }}>
                    <Avatar initials={person.initials} size="lg" muted={!person.active} />
                    <div className="grow">
                      <div className="row row--wrap" style={{ gap: 'var(--space-2)' }}>
                        <strong>{person.full_name}</strong>
                        <Chip tone={roleTone[person.role]}>{roleLabel[person.role]}</Chip>
                        {!person.active && <Chip tone="red">לא פעיל</Chip>}
                        {person.must_change_password && (
                          <Chip tone="amber">ממתין להחלפת סיסמה</Chip>
                        )}
                      </div>
                      <div className="cell-meta">
                        {[person.title, person.department].filter(Boolean).join(' · ') || '—'}
                      </div>
                      <div className="person-card__contact">
                        <span><Mail aria-hidden /><span className="ltr">{person.email}</span></span>
                        {person.phone && (
                          <span><Phone aria-hidden /><span className="ltr">{person.phone}</span></span>
                        )}
                        <span>
                          {person.last_login_at
                            ? `כניסה אחרונה ${relativeTime(person.last_login_at)}`
                            : 'טרם התחבר'}
                        </span>
                      </div>
                    </div>
                    <div className="row" style={{ gap: 'var(--space-2)' }}>
                      <Button size="sm" icon={<Pencil size={14} />}
                              onClick={() => setEditing(person)}>
                        עריכה
                      </Button>
                      <Button size="sm" variant="ghost" icon={<KeyRound size={14} />}
                              onClick={() => setResetting(person)}>
                        איפוס סיסמה
                      </Button>
                      {person.id !== me?.id && (
                        <Button
                          size="sm" variant="ghost"
                          icon={person.active ? <UserX size={14} /> : <UserCheck size={14} />}
                          onClick={() => void toggleActive(person)}
                        >
                          {person.active ? 'השבתה' : 'הפעלה'}
                        </Button>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </Card>
      )}

      <UserDialog
        open={creating || editing !== null}
        person={editing}
        departments={departments.data?.items ?? []}
        onClose={() => { setCreating(false); setEditing(null); }}
        onSaved={() => { users.reload(); setCreating(false); setEditing(null); }}
      />
      <ResetPasswordDialog
        person={resetting}
        onClose={() => setResetting(null)}
        onDone={() => { users.reload(); setResetting(null); }}
      />
    </PageFrame>
  );
}

function UserDialog({
  open, person, departments, onClose, onSaved,
}: {
  open: boolean; person: User | null; departments: Department[];
  onClose: () => void; onSaved: () => void;
}) {
  const toast = useToast();
  const { busy, run } = useAction();
  const [error, setError] = useState('');
  const [fullName, setFullName] = useState('');
  const [email, setEmail] = useState('');
  const [phone, setPhone] = useState('');
  const [title, setTitle] = useState('');
  const [role, setRole] = useState<Role>('requester');
  const [departmentId, setDepartmentId] = useState('');
  const [password, setPassword] = useState('');
  const [ready, setReady] = useState(false);

  // Populate once per open, so typing is not overwritten on re-render.
  if (open && !ready) {
    setFullName(person?.full_name ?? '');
    setEmail(person?.email ?? '');
    setPhone(person?.phone ?? '');
    setTitle(person?.title ?? '');
    setRole(person?.role ?? 'requester');
    setDepartmentId(String(person?.department_id ?? ''));
    setPassword('');
    setError('');
    setReady(true);
  }
  if (!open && ready) setReady(false);

  const submit = (event: FormEvent) => {
    event.preventDefault();
    if (fullName.trim().length < 2) { setError('יש להזין שם מלא'); return; }
    if (!person && password.length < 10) {
      setError('הסיסמה הראשונית חייבת להכיל לפחות 10 תווים'); return;
    }
    setError('');

    const body = person
      ? {
        full_name: fullName.trim(), phone: phone.trim() || null,
        title: title.trim() || null, role,
        department_id: departmentId ? Number(departmentId) : null,
      }
      : {
        full_name: fullName.trim(), email: email.trim().toLowerCase(),
        phone: phone.trim() || null, title: title.trim() || null, role,
        department_id: departmentId ? Number(departmentId) : null,
        password, active: true,
      };

    void run(
      () => (person ? patch(`/users/${person.id}`, body) : post('/users', body)),
      {
        onSuccess: () => { toast.success(person ? 'המשתמש עודכן' : 'נוצר משתמש'); onSaved(); },
        onError: setError,
      },
    );
  };

  return (
    <Dialog
      open={open} onClose={onClose}
      title={person ? `עריכת ${person.full_name}` : 'משתמש חדש'}
      footer={
        <>
          <Button variant="primary" loading={busy} type="submit" form="user-form">שמירה</Button>
          <Button variant="ghost" onClick={onClose}>ביטול</Button>
        </>
      }
    >
      <form id="user-form" className="stack" onSubmit={submit}>
        {error && <Banner tone="danger">{error}</Banner>}

        <TextField
          label="שם מלא" required value={fullName}
          onChange={(event) => setFullName(event.target.value)}
        />
        <TextField
          label="כתובת דוא״ל" type="email" required dir="ltr" className="input ltr"
          value={email} disabled={person !== null}
          hint={person ? 'לא ניתן לשנות כתובת דוא״ל של משתמש קיים' : 'משמשת גם כשם המשתמש בכניסה'}
          onChange={(event) => setEmail(event.target.value)}
        />
        <div className="grid grid--2">
          <TextField
            label="טלפון" type="tel" dir="ltr" className="input ltr" value={phone}
            onChange={(event) => setPhone(event.target.value)}
          />
          <TextField
            label="תפקיד בארגון" value={title}
            onChange={(event) => setTitle(event.target.value)}
          />
        </div>
        <div className="grid grid--2">
          <SelectField
            label="הרשאה במערכת" value={role}
            onChange={(event) => setRole(event.target.value as Role)}
          >
            {ROLES.map((value) => (
              <option key={value} value={value}>{roleLabel[value]}</option>
            ))}
          </SelectField>
          <SelectField
            label="מחלקה" value={departmentId}
            onChange={(event) => setDepartmentId(event.target.value)}
          >
            <option value="">לא משויך</option>
            {departments.map((department) => (
              <option key={department.id} value={department.id}>{department.name}</option>
            ))}
          </SelectField>
        </div>

        {!person && (
          <TextField
            label="סיסמה ראשונית" type="password" required minLength={10} value={password}
            onChange={(event) => setPassword(event.target.value)}
            hint="לפחות 10 תווים. המשתמש יידרש להחליף אותה בכניסה הראשונה."
          />
        )}
      </form>
    </Dialog>
  );
}

function ResetPasswordDialog({
  person, onClose, onDone,
}: { person: User | null; onClose: () => void; onDone: () => void }) {
  const toast = useToast();
  const { busy, run } = useAction();
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');

  const submit = (event: FormEvent) => {
    event.preventDefault();
    if (password.length < 10) { setError('הסיסמה חייבת להכיל לפחות 10 תווים'); return; }
    setError('');
    void run(
      () => post(`/users/${person!.id}/reset-password`, { password }),
      {
        onSuccess: () => {
          toast.success('הסיסמה אופסה. המשתמש יידרש להחליף אותה בכניסה הבאה.');
          setPassword(''); onDone();
        },
        onError: setError,
      },
    );
  };

  return (
    <Dialog
      open={person !== null} onClose={onClose} title="איפוס סיסמה"
      footer={
        <>
          <Button variant="primary" loading={busy} type="submit" form="reset-form">
            איפוס
          </Button>
          <Button variant="ghost" onClick={onClose}>ביטול</Button>
        </>
      }
    >
      <form id="reset-form" className="stack" onSubmit={submit}>
        {error && <Banner tone="danger">{error}</Banner>}
        <Banner tone="warning">
          מסרו את הסיסמה הזמנית למשתמש בערוץ בטוח. הוא יידרש להחליף אותה מיד בכניסה הבאה.
        </Banner>
        <TextField
          label={`סיסמה זמנית עבור ${person?.full_name ?? ''}`}
          type="text" required minLength={10} value={password}
          onChange={(event) => setPassword(event.target.value)}
          hint="לפחות 10 תווים, בשילוב אותיות ומספרים"
        />
      </form>
    </Dialog>
  );
}
