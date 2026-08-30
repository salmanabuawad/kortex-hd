import { useState, type FormEvent } from 'react';
import { useNavigate } from 'react-router-dom';
import { KeyRound, LifeBuoy } from 'lucide-react';

import { post } from '../lib/api';
import { useAuth } from '../lib/auth';
import { Banner, Button, TextField } from '../components/ui';
import { useToast } from '../components/ui/toast';

const MIN_LENGTH = 10;

export default function ChangePassword() {
  const { user, refresh, logout } = useAuth();
  const navigate = useNavigate();
  const toast = useToast();

  const [current, setCurrent] = useState('');
  const [next, setNext] = useState('');
  const [confirm, setConfirm] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  const forced = user?.must_change_password ?? false;

  const validate = (): string | null => {
    if (next.length < MIN_LENGTH) return `הסיסמה חייבת להכיל לפחות ${MIN_LENGTH} תווים`;
    if (/^\d+$/.test(next) || /^[A-Za-z]+$/.test(next)) {
      return 'הסיסמה חייבת לשלב אותיות ומספרים';
    }
    if (next !== confirm) return 'הסיסמאות אינן תואמות';
    if (next === current) return 'הסיסמה החדשה זהה לנוכחית';
    return null;
  };

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    const problem = validate();
    if (problem) { setError(problem); return; }

    setError('');
    setBusy(true);
    try {
      await post('/me/password', { current_password: current, new_password: next });
      await refresh();
      toast.success('הסיסמה עודכנה');
      navigate('/', { replace: true });
    } catch (err) {
      setError(err instanceof Error ? err.message : 'עדכון הסיסמה נכשל');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="login">
      <aside className="login__aside">
        <div className="login__ridge" aria-hidden />
        <div className="login__brand">
          <span className="sidebar__mark"><LifeBuoy size={20} /></span>
          <div>
            <div className="sidebar__title">מוקד שירות</div>
            <div className="sidebar__subtitle">מועצה מקומית בוקעאתא</div>
          </div>
        </div>
        <div className="login__lead">
          <h2>אבטחת החשבון שלך</h2>
          <p>
            סיסמה אישית שאינה ידועה לאיש אחר היא הדרך היחידה לוודא שפעולות שבוצעו
            בחשבון שלך אכן בוצעו על ידך.
          </p>
        </div>
        <div />
      </aside>

      <main className="login__main">
        <div className="login__card">
          <h1 className="login__title">
            {forced ? 'בחירת סיסמה חדשה' : 'החלפת סיסמה'}
          </h1>
          <p className="login__sub">
            {forced
              ? 'זו הכניסה הראשונה שלך. יש לבחור סיסמה אישית לפני שממשיכים.'
              : 'בחרו סיסמה חדשה לחשבון שלך.'}
          </p>

          {error && (
            <div style={{ marginBottom: 'var(--space-4)' }}>
              <Banner tone="danger">{error}</Banner>
            </div>
          )}

          <form className="stack" onSubmit={submit} noValidate>
            <TextField
              label="סיסמה נוכחית" type="password" autoComplete="current-password" required
              value={current} onChange={(event) => setCurrent(event.target.value)}
            />
            <TextField
              label="סיסמה חדשה" type="password" autoComplete="new-password" required
              value={next} onChange={(event) => setNext(event.target.value)}
              hint={`לפחות ${MIN_LENGTH} תווים, בשילוב אותיות ומספרים`}
            />
            <TextField
              label="אימות הסיסמה החדשה" type="password" autoComplete="new-password" required
              value={confirm} onChange={(event) => setConfirm(event.target.value)}
            />

            <Button
              type="submit" variant="primary" size="lg" block
              loading={busy} icon={<KeyRound size={17} />}
            >
              שמירת הסיסמה
            </Button>

            {forced && (
              <Button
                type="button" variant="ghost" block
                onClick={() => { logout(); navigate('/login', { replace: true }); }}
              >
                יציאה מהמערכת
              </Button>
            )}
          </form>
        </div>
      </main>
    </div>
  );
}
