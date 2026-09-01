import { useState, type FormEvent } from 'react';
import { useNavigate } from 'react-router-dom';
import { Building2, KeyRound } from 'lucide-react';

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
      <main className="login__main">
        <div className="login__card">
          <div className="login__brand-block">
            <span className="login__mark"><Building2 size={20} /></span>
            <div>
              <div className="appbar__brand-name">מוקד שירות</div>
              <div className="appbar__brand-council">מועצה מקומית בוקעאתא</div>
            </div>
          </div>
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
