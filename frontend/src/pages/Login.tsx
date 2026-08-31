import { useState, type FormEvent } from 'react';
import { Navigate, useLocation, useNavigate } from 'react-router-dom';
import { Eye, EyeOff, LifeBuoy, LogIn } from 'lucide-react';

import { useAuth } from '../lib/auth';
import { Banner, Button, TextField } from '../components/ui';

export default function Login() {
  const { user, login, loading } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [remember, setRemember] = useState(true);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  if (!loading && user) {
    const from = (location.state as { from?: Location } | null)?.from?.pathname ?? '/';
    return <Navigate to={from} replace />;
  }

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    setError('');
    setBusy(true);
    try {
      const account = await login(email.trim(), password);
      navigate(account.must_change_password ? '/change-password' : '/', { replace: true });
    } catch (err) {
      setError(err instanceof Error ? err.message : 'ההתחברות נכשלה');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="login">
      <main className="login__main">
        <div className="login__card">
          <div className="login__brand-block">
            <span className="login__mark"><LifeBuoy size={20} /></span>
            <div>
              <div className="appbar__brand-name">מוקד שירות</div>
              <div className="appbar__brand-council">מועצה מקומית בוקעאתא</div>
            </div>
          </div>

          <h1 className="login__title">כניסה למערכת</h1>
          <p className="login__sub">
            מערכת פניות פנימית לעובדי המועצה.
          </p>

          {error && (
            <div style={{ marginBottom: 'var(--space-4)' }}>
              <Banner tone="danger">{error}</Banner>
            </div>
          )}

          <form className="stack" onSubmit={submit} noValidate>
            <TextField
              label="כתובת דוא״ל"
              type="email"
              inputMode="email"
              autoComplete="username"
              className="input ltr"
              dir="ltr"
              required
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              placeholder="name@buqata.muni.il"
            />

            <div className="field">
              <label className="field__label" htmlFor="login-password">
                סיסמה<span className="field__required" aria-hidden>*</span>
              </label>
              <div className="password-input">
                <input
                  id="login-password"
                  className="input"
                  type={showPassword ? 'text' : 'password'}
                  autoComplete="current-password"
                  required
                  value={password}
                  onChange={(event) => setPassword(event.target.value)}
                />
                <button
                  type="button"
                  onClick={() => setShowPassword((value) => !value)}
                  aria-label={showPassword ? 'הסתרת הסיסמה' : 'הצגת הסיסמה'}
                >
                  {showPassword ? <EyeOff size={16} /> : <Eye size={16} />}
                </button>
              </div>
            </div>

            <div className="login__row">
              <label className="checkbox">
                <input
                  type="checkbox"
                  checked={remember}
                  onChange={(event) => setRemember(event.target.checked)}
                />
                <span className="checkbox__text">זכור אותי במכשיר זה</span>
              </label>
            </div>

            <Button
              type="submit" variant="primary" size="lg" block
              loading={busy} icon={<LogIn size={17} />}
            >
              כניסה
            </Button>
          </form>

          <p className="login__foot">
            שכחתם סיסמה? פנו למנהל המערכת לאיפוס.
          </p>
        </div>
      </main>
    </div>
  );
}
