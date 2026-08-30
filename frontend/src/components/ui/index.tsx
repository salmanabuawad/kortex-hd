import {
  useEffect, useRef, type ButtonHTMLAttributes, type InputHTMLAttributes, type ReactNode,
  type SelectHTMLAttributes, type TextareaHTMLAttributes,
} from 'react';
import {
  AlertCircle, AlertTriangle, CheckCircle2, Inbox, Loader2, Lock, X,
} from 'lucide-react';

import type { Tone } from '../../lib/labels';

/* -------------------------------------------------------------------------- */
/* Button                                                                      */
/* -------------------------------------------------------------------------- */

type ButtonVariant = 'primary' | 'secondary' | 'ghost' | 'success' | 'danger';

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant;
  size?: 'sm' | 'md' | 'lg';
  icon?: ReactNode;
  loading?: boolean;
  block?: boolean;
}

export function Button({
  variant = 'secondary', size = 'md', icon, loading, block, children, className = '',
  disabled, ...rest
}: ButtonProps) {
  const classes = [
    'btn', `btn--${variant}`,
    size !== 'md' ? `btn--${size}` : '',
    block ? 'btn--block' : '',
    className,
  ].filter(Boolean).join(' ');

  return (
    <button className={classes} disabled={disabled || loading} {...rest}>
      {loading ? <Loader2 className="spin" aria-hidden /> : icon}
      {children}
    </button>
  );
}

export function IconButton({
  label, children, className = '', ...rest
}: ButtonHTMLAttributes<HTMLButtonElement> & { label: string }) {
  return (
    <button className={`icon-btn ${className}`} title={label} aria-label={label} {...rest}>
      {children}
    </button>
  );
}

/* -------------------------------------------------------------------------- */
/* Chips and avatars                                                           */
/* -------------------------------------------------------------------------- */

export function Chip({
  tone = 'neutral', dot, icon, children,
}: { tone?: Tone; dot?: boolean; icon?: ReactNode; children: ReactNode }) {
  return (
    <span className={`chip chip--${tone}${dot ? ' chip--dot' : ''}`}>
      {icon}
      {children}
    </span>
  );
}

export function Avatar({
  initials, size = 'md', muted,
}: { initials: string; size?: 'sm' | 'md' | 'lg'; muted?: boolean }) {
  const classes = [
    'avatar',
    size !== 'md' ? `avatar--${size}` : '',
    muted ? 'avatar--muted' : '',
  ].filter(Boolean).join(' ');
  return <span className={classes} aria-hidden>{initials}</span>;
}

/* -------------------------------------------------------------------------- */
/* Surfaces                                                                    */
/* -------------------------------------------------------------------------- */

export function Card({
  children, className = '', ...rest
}: { children: ReactNode; className?: string } & React.HTMLAttributes<HTMLDivElement>) {
  return <section className={`card ${className}`} {...rest}>{children}</section>;
}

export function CardHeader({
  title, action, icon,
}: { title: string; action?: ReactNode; icon?: ReactNode }) {
  return (
    <header className="card__header">
      {icon}
      <h3 className="card__title">{title}</h3>
      {action}
    </header>
  );
}

export function PageHeader({
  title, subtitle, actions,
}: { title: string; subtitle?: string; actions?: ReactNode }) {
  return (
    <div className="page-header">
      <div className="page-header__text">
        <h1>{title}</h1>
        {subtitle && <p className="page-header__sub">{subtitle}</p>}
      </div>
      {actions && <div className="page-header__actions">{actions}</div>}
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/* Form controls                                                               */
/* -------------------------------------------------------------------------- */

let fieldSeq = 0;
const nextId = () => `f${++fieldSeq}`;

interface FieldShell {
  label: string;
  hint?: string;
  error?: string;
  required?: boolean;
  children: (id: string) => ReactNode;
}

export function Field({ label, hint, error, required, children }: FieldShell) {
  const idRef = useRef<string>('');
  if (!idRef.current) idRef.current = nextId();
  const id = idRef.current;

  return (
    <div className="field">
      <label className="field__label" htmlFor={id}>
        {label}
        {required && <span className="field__required" aria-hidden>*</span>}
      </label>
      {children(id)}
      {error ? <span className="field__error" role="alert">{error}</span>
        : hint ? <span className="field__hint">{hint}</span> : null}
    </div>
  );
}

export function TextField({
  label, hint, error, required, ...rest
}: { label: string; hint?: string; error?: string } & InputHTMLAttributes<HTMLInputElement>) {
  return (
    <Field label={label} hint={hint} error={error} required={required}>
      {(id) => (
        <input
          id={id} className="input" required={required}
          aria-invalid={error ? true : undefined} {...rest}
        />
      )}
    </Field>
  );
}

export function TextAreaField({
  label, hint, error, required, ...rest
}: { label: string; hint?: string; error?: string } & TextareaHTMLAttributes<HTMLTextAreaElement>) {
  return (
    <Field label={label} hint={hint} error={error} required={required}>
      {(id) => (
        <textarea
          id={id} className="textarea" required={required}
          aria-invalid={error ? true : undefined} {...rest}
        />
      )}
    </Field>
  );
}

export function SelectField({
  label, hint, error, required, children, ...rest
}: { label: string; hint?: string; error?: string; children: ReactNode }
  & SelectHTMLAttributes<HTMLSelectElement>) {
  return (
    <Field label={label} hint={hint} error={error} required={required}>
      {(id) => (
        <select id={id} className="select" required={required} {...rest}>
          {children}
        </select>
      )}
    </Field>
  );
}

export function Switch({
  checked, onChange, label,
}: { checked: boolean; onChange: (value: boolean) => void; label: string }) {
  return (
    <label className="switch" title={label}>
      <input
        type="checkbox" checked={checked} aria-label={label}
        onChange={(e) => onChange(e.target.checked)}
      />
      <span className="switch__track" />
    </label>
  );
}

/* -------------------------------------------------------------------------- */
/* Tabs                                                                        */
/* -------------------------------------------------------------------------- */

export interface TabSpec {
  id: string;
  label: string;
  count?: number;
  icon?: ReactNode;
}

export function Tabs({
  tabs, active, onChange,
}: { tabs: TabSpec[]; active: string; onChange: (id: string) => void }) {
  return (
    <div className="tabs" role="tablist">
      {tabs.map((tab) => (
        <button
          key={tab.id}
          role="tab"
          type="button"
          className="tab"
          aria-selected={active === tab.id}
          aria-controls={`panel-${tab.id}`}
          onClick={() => onChange(tab.id)}
        >
          {tab.icon}
          {tab.label}
          {tab.count !== undefined && tab.count > 0 && (
            <span className="tab__count">{tab.count}</span>
          )}
        </button>
      ))}
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/* Dialog and drawer                                                           */
/* -------------------------------------------------------------------------- */

/** Closes on Escape, restores focus, and traps focus inside while open. */
function useDismissable(open: boolean, onClose: () => void) {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return undefined;
    const previouslyFocused = document.activeElement as HTMLElement | null;

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') { onClose(); return; }
      if (event.key !== 'Tab' || !ref.current) return;

      const focusable = ref.current.querySelectorAll<HTMLElement>(
        'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])',
      );
      if (!focusable.length) return;
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault(); last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault(); first.focus();
      }
    };

    document.addEventListener('keydown', onKeyDown);
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    // Focus the first control so keyboard users land inside the dialog.
    window.setTimeout(() => {
      ref.current?.querySelector<HTMLElement>(
        'input, textarea, select, button')?.focus();
    }, 0);

    return () => {
      document.removeEventListener('keydown', onKeyDown);
      document.body.style.overflow = previousOverflow;
      previouslyFocused?.focus?.();
    };
  }, [open, onClose]);

  return ref;
}

export function Dialog({
  open, onClose, title, children, footer, wide,
}: {
  open: boolean; onClose: () => void; title: string;
  children: ReactNode; footer?: ReactNode; wide?: boolean;
}) {
  const ref = useDismissable(open, onClose);
  if (!open) return null;

  return (
    <div className="overlay" onMouseDown={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div
        className={`dialog${wide ? ' dialog--wide' : ''}`}
        role="dialog" aria-modal="true" aria-label={title} ref={ref}
      >
        <header className="dialog__header">
          <h2 className="dialog__title">{title}</h2>
          <IconButton label="סגירה" onClick={onClose}><X /></IconButton>
        </header>
        <div className="dialog__body">{children}</div>
        {footer && <footer className="dialog__footer">{footer}</footer>}
      </div>
    </div>
  );
}

export function Drawer({
  open, onClose, title, children, footer,
}: {
  open: boolean; onClose: () => void; title: string;
  children: ReactNode; footer?: ReactNode;
}) {
  const ref = useDismissable(open, onClose);
  if (!open) return null;

  return (
    <div className="drawer-overlay"
         onMouseDown={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="drawer" role="dialog" aria-modal="true" aria-label={title} ref={ref}>
        <header className="dialog__header">
          <h2 className="dialog__title">{title}</h2>
          <IconButton label="סגירה" onClick={onClose}><X /></IconButton>
        </header>
        <div className="dialog__body grow">{children}</div>
        {footer && <footer className="dialog__footer">{footer}</footer>}
      </div>
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/* States                                                                      */
/* -------------------------------------------------------------------------- */

export function EmptyState({
  title, text, icon, action,
}: { title: string; text?: string; icon?: ReactNode; action?: ReactNode }) {
  return (
    <div className="state">
      <div className="state__icon">{icon ?? <Inbox />}</div>
      <p className="state__title">{title}</p>
      {text && <p className="state__text">{text}</p>}
      {action}
    </div>
  );
}

export function ErrorState({ message, onRetry }: { message: string; onRetry?: () => void }) {
  return (
    <div className="state">
      <div className="state__icon state__icon--danger"><AlertTriangle /></div>
      <p className="state__title">משהו השתבש</p>
      <p className="state__text">{message}</p>
      {onRetry && <Button variant="secondary" onClick={onRetry}>נסו שוב</Button>}
    </div>
  );
}

export function DeniedState() {
  return (
    <div className="state">
      <div className="state__icon"><Lock /></div>
      <p className="state__title">אין לך הרשאה לעמוד זה</p>
      <p className="state__text">
        הרשאות נקבעות לפי התפקיד שלך במערכת. אם לדעתך מדובר בטעות, פנו למנהל המערכת.
      </p>
    </div>
  );
}

export function Skeleton({
  width, height = 14, radius,
}: { width?: number | string; height?: number; radius?: number }) {
  return (
    <span
      className="skeleton"
      style={{ display: 'block', width: width ?? '100%', height, borderRadius: radius }}
    />
  );
}

export function SkeletonRows({ rows = 5 }: { rows?: number }) {
  return (
    <div aria-busy="true" aria-label="טוען">
      {Array.from({ length: rows }, (_, index) => (
        <div className="skeleton-row" key={index}>
          <Skeleton width={30} height={30} radius={15} />
          <div className="grow stack" style={{ gap: 6 }}>
            <Skeleton width={`${55 + (index % 3) * 12}%`} />
            <Skeleton width="30%" height={10} />
          </div>
          <Skeleton width={70} height={22} radius={6} />
        </div>
      ))}
    </div>
  );
}

export function SkeletonCards({ count = 4 }: { count?: number }) {
  return (
    <div className="grid grid--4" aria-busy="true" aria-label="טוען">
      {Array.from({ length: count }, (_, index) => (
        <div className="kpi" key={index}>
          <Skeleton width={38} height={38} radius={10} />
          <div className="grow stack" style={{ gap: 8 }}>
            <Skeleton width="45%" height={26} />
            <Skeleton width="70%" height={11} />
          </div>
        </div>
      ))}
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/* Banner                                                                      */
/* -------------------------------------------------------------------------- */

export function Banner({
  tone, title, children, action,
}: {
  tone: 'info' | 'warning' | 'danger' | 'success';
  title?: string; children: ReactNode; action?: ReactNode;
}) {
  const Icon = tone === 'success' ? CheckCircle2
    : tone === 'info' ? AlertCircle
      : tone === 'warning' ? AlertTriangle : AlertCircle;

  return (
    <div className={`banner banner--${tone}`} role={tone === 'danger' ? 'alert' : 'status'}>
      <Icon aria-hidden />
      <div className="grow">
        {title && <div className="banner__title">{title}</div>}
        <div>{children}</div>
      </div>
      {action}
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/* Pagination                                                                  */
/* -------------------------------------------------------------------------- */

export function Pagination({
  page, pageSize, total, onChange,
}: { page: number; pageSize: number; total: number; onChange: (page: number) => void }) {
  const pages = Math.max(1, Math.ceil(total / pageSize));
  if (total === 0) return null;
  const from = (page - 1) * pageSize + 1;
  const to = Math.min(page * pageSize, total);

  return (
    <div className="pagination">
      <span>
        מציג <span className="num">{from}–{to}</span> מתוך <span className="num">{total}</span>
      </span>
      <div className="row" style={{ gap: 'var(--space-2)' }}>
        <Button size="sm" disabled={page <= 1} onClick={() => onChange(page - 1)}>
          הקודם
        </Button>
        <span style={{ fontSize: 'var(--text-sm)' }}>
          <span className="num">{page}</span> / <span className="num">{pages}</span>
        </span>
        <Button size="sm" disabled={page >= pages} onClick={() => onChange(page + 1)}>
          הבא
        </Button>
      </div>
    </div>
  );
}
