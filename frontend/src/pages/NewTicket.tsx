import { useEffect, useMemo, useState, type FormEvent } from 'react';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import {
  AlertTriangle, ArrowLeft, ArrowRight, Building2, Check, Database, LifeBuoy, Lightbulb,
  Network, Paperclip, Printer, Send, ShieldCheck, Sparkles, TicketPlus,
} from 'lucide-react';

import { get, post, upload } from '../lib/api';
import { useAsync } from '../lib/hooks';
import { formatCurrency, formatHours } from '../lib/format';
import { priorityLabel } from '../lib/labels';
import type { Category, KnownIssue, Priority, RequestType, Ticket } from '../lib/types';
import {
  Banner, Button, Card, CardHeader, ErrorState, SelectField, Skeleton,
  TextAreaField, TextField,
} from '../components/ui';
import { PageFrame } from '../components/layout/Shell';
import { MediaPicker, type PendingMedia } from '../components/media/MediaPicker';
import { useToast } from '../components/ui/toast';

const ICONS: Record<string, React.ReactNode> = {
  Network: <Network size={17} />,
  Database: <Database size={17} />,
  Printer: <Printer size={17} />,
  Building2: <Building2 size={17} />,
  ShieldCheck: <ShieldCheck size={17} />,
  LifeBuoy: <LifeBuoy size={17} />,
  AlertTriangle: <AlertTriangle size={17} />,
  Sparkles: <Sparkles size={17} />,
};

const PRIORITIES: Priority[] = ['low', 'normal', 'high', 'urgent'];

type StepId = 'category' | 'type' | 'details' | 'media';

export default function NewTicket() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const toast = useToast();

  const categories = useAsync<{ items: Category[] }>(
    () => get<{ items: Category[] }>('/categories'), []);

  const [step, setStep] = useState<StepId>('category');
  const [categoryId, setCategoryId] = useState<number | null>(null);
  const [requestTypeId, setRequestTypeId] = useState<number | null>(null);
  const [subject, setSubject] = useState('');
  const [description, setDescription] = useState('');
  const [priority, setPriority] = useState<Priority>('normal');
  const [cost, setCost] = useState('');
  const [hours, setHours] = useState('');
  const [media, setMedia] = useState<PendingMedia[]>([]);
  const [error, setError] = useState('');
  /** Which details field a validation message belongs to, so it can be shown
   *  on the field itself and not only in the banner at the top of the pane. */
  const [errorField, setErrorField] = useState<'subject' | 'description' | null>(null);
  const [busy, setBusy] = useState(false);
  /** Set while attachments upload, after the ticket itself already exists. */
  const [uploading, setUploading] = useState('');

  const category = useMemo(
    () => categories.data?.items.find((c) => c.id === categoryId) ?? null,
    [categories.data, categoryId],
  );

  const requestType = useMemo(
    () => category?.request_types.find((rt) => rt.id === requestTypeId) ?? null,
    [category, requestTypeId],
  );

  const known = useAsync<{ items: KnownIssue[] }>(
    () => (categoryId
      ? get<{ items: KnownIssue[] }>(`/known-issues?category_id=${categoryId}`)
      : Promise.resolve({ items: [] })),
    [categoryId],
  );

  const isNewService = requestType?.key === 'new_service';
  const hasTypes = (category?.request_types.length ?? 0) > 0;

  const steps = useMemo<StepId[]>(
    () => (hasTypes
      ? ['category', 'type', 'details', 'media']
      : ['category', 'details', 'media']),
    [hasTypes],
  );
  const stepIndex = Math.max(0, steps.indexOf(step));
  const isFirst = stepIndex <= 0;
  const isLast = stepIndex === steps.length - 1;

  const approvalNotice = useMemo(() => {
    if (!category) return null;
    const reasons: string[] = [];
    const costValue = cost ? Number(cost) : null;
    const hoursValue = hours ? Number(hours) : null;
    if (category.approval_new_service && isNewService) reasons.push('בקשה לשירות חדש');
    if (category.cost_threshold != null && costValue != null
        && costValue > category.cost_threshold) {
      reasons.push(`עלות מעל ${formatCurrency(category.cost_threshold)}`);
    }
    if (category.hours_threshold != null && hoursValue != null
        && hoursValue > category.hours_threshold) {
      reasons.push(`היקף עבודה מעל ${formatHours(category.hours_threshold)}`);
    }
    return reasons.length ? reasons : null;
  }, [category, isNewService, cost, hours]);

  const goTo = (id: StepId) => {
    setError('');
    setErrorField(null);
    setStep(id);
  };

  const goNext = () => {
    if (step === 'category' && !categoryId) {
      setError('יש לבחור קטגוריה');
      return;
    }
    // Validate the details here rather than only on submit: now that media is
    // a step of its own, an empty subject would otherwise surface a step later,
    // away from the field it belongs to.
    if (step === 'details') {
      if (subject.trim().length < 3) {
        setError('יש להזין נושא לקריאה'); setErrorField('subject'); return;
      }
      if (!description.trim()) {
        setError('יש לתאר את הבקשה'); setErrorField('description'); return;
      }
    }
    const next = steps[stepIndex + 1];
    if (next) goTo(next);
  };

  const goBack = () => {
    const prev = steps[stepIndex - 1];
    if (prev) goTo(prev);
  };

  const chooseCategory = (next: Category) => {
    setCategoryId(next.id);
    setPriority(next.default_priority);
    setRequestTypeId((current) =>
      next.request_types.some((rt) => rt.id === current) ? current : null);
    setError('');
    setStep(next.request_types.length > 0 ? 'type' : 'details');
  };

  const chooseType = (type: RequestType) => {
    setRequestTypeId(type.id);
    setError('');
    setStep('details');
  };

  useEffect(() => {
    if (step === 'type' && !hasTypes) {
      setStep(categoryId ? 'details' : 'category');
    }
  }, [step, hasTypes, categoryId]);

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    if (!isLast) {
      goNext();
      return;
    }
    if (!categoryId) { setError('יש לבחור קטגוריה'); goTo('category'); return; }
    if (subject.trim().length < 3) {
      goTo('details'); setError('יש להזין נושא לקריאה'); setErrorField('subject'); return;
    }
    if (!description.trim()) {
      goTo('details'); setError('יש לתאר את הבקשה'); setErrorField('description'); return;
    }

    setError('');
    setBusy(true);
    try {
      const ticket = await post<Ticket>('/tickets', {
        subject: subject.trim(),
        description: description.trim(),
        category_id: categoryId,
        request_type_id: requestTypeId,
        priority,
        estimated_cost: cost ? Number(cost) : null,
        estimated_hours: hours ? Number(hours) : null,
      });

      // The ticket exists from here on. Attachments are uploaded one at a time
      // against its id, and a failure among them must not discard the ticket
      // the user just wrote -- it is reported, and the ticket still opens.
      const failed: string[] = [];
      for (const [index, item] of media.entries()) {
        setUploading(t('media.uploadingOne', { index: index + 1, total: media.length }));
        try {
          await upload(`/tickets/${ticket.id}/attachments`, item.file);
        } catch {
          failed.push(item.file.name);
        }
      }
      setUploading('');

      toast.success(`נפתחה קריאה ${ticket.number}`);
      if (failed.length) {
        toast.error(t('media.uploadFailed', { names: failed.join(', ') }));
      }
      navigate(`/tickets/${ticket.id}`, { replace: true });
    } catch (err) {
      setError(err instanceof Error ? err.message : 'פתיחת הקריאה נכשלה');
    } finally {
      setUploading('');
      setBusy(false);
    }
  };

  if (categories.error) {
    return <ErrorState message={categories.error} onRetry={categories.reload} />;
  }

  const stepLabel: Record<StepId, string> = {
    category: 'במה מדובר?',
    type: 'סוג הפנייה',
    details: 'פרטי הפנייה',
    media: t('media.step'),
  };

  // The path is not a fixed length -- a category with no request types drops the
  // second step -- so the heading says where we are instead of promising a
  // count it cannot keep.
  const progressLabel = `שלב ${stepIndex + 1} מתוך ${steps.length} · ${stepLabel[step]}`;

  return (
    <PageFrame
      fill
      icon={<TicketPlus />}
      title="פתיחת קריאה חדשה"
      summary={progressLabel}
      actions={
        <Button variant="ghost" icon={<ArrowLeft className="dir-icon" size={16} />} onClick={() => navigate(-1)}>
          חזרה
        </Button>
      }
    >
      <form className="wizard" onSubmit={submit}>
        <ol className="wizard__steps" aria-label="שלבי פתיחת הקריאה">
          {steps.map((id, index) => {
            const state = index < stepIndex ? 'done' : index === stepIndex ? 'current' : 'todo';
            return (
              <li key={id} className={`wizard__step wizard__step--${state}`}>
                {index > 0 && <span className="wizard__line" aria-hidden />}
                <button
                  type="button"
                  className="wizard__dot"
                  aria-current={state === 'current' ? 'step' : undefined}
                  disabled={index > stepIndex}
                  onClick={() => { if (index <= stepIndex) goTo(id); }}
                >
                  {state === 'done' ? <Check size={14} /> : index + 1}
                </button>
                <span className="wizard__label">{stepLabel[id]}</span>
              </li>
            );
          })}
        </ol>

        {error && !errorField && <Banner tone="danger">{error}</Banner>}

        <div className="wizard__pane">
          {step === 'category' && (
            <Card>
              <CardHeader title="במה מדובר?" />
              <div className="card__body">
                {categories.loading ? (
                  <div className="choices choices--3">
                    {Array.from({ length: 5 }, (_, i) => <Skeleton key={i} height={64} radius={10} />)}
                  </div>
                ) : (
                  <div className="choices choices--3">
                    {categories.data?.items.map((item) => (
                      <button
                        type="button"
                        key={item.id}
                        className={`choice${categoryId === item.id ? ' choice--selected' : ''}`}
                        onClick={() => chooseCategory(item)}
                        aria-pressed={categoryId === item.id}
                      >
                        <span className="choice__icon">
                          {ICONS[item.icon] ?? <LifeBuoy size={17} />}
                        </span>
                        <span className="grow">
                          <span className="choice__title" style={{ display: 'block' }}>
                            {item.name}
                          </span>
                          {item.description && (
                            <span className="choice__desc">{item.description}</span>
                          )}
                        </span>
                      </button>
                    ))}
                  </div>
                )}
              </div>
            </Card>
          )}

          {step === 'type' && category && (
            <Card>
              <CardHeader title="סוג הפנייה" />
              <div className="card__body">
                <div className="choices choices--2">
                  {category.request_types.map((type: RequestType) => (
                    <button
                      type="button"
                      key={type.id}
                      className={`choice${requestTypeId === type.id ? ' choice--selected' : ''}`}
                      onClick={() => chooseType(type)}
                      aria-pressed={requestTypeId === type.id}
                    >
                      <span className="choice__icon">
                        {ICONS[type.icon ?? ''] ?? <LifeBuoy size={17} />}
                      </span>
                      <span className="grow">
                        <span className="choice__title" style={{ display: 'block' }}>
                          {type.name}
                        </span>
                        {type.description && (
                          <span className="choice__desc">{type.description}</span>
                        )}
                      </span>
                    </button>
                  ))}
                </div>
              </div>
            </Card>
          )}

          {step === 'details' && categoryId && (
            <div className="stack">
              {categoryId && (known.data?.items.length ?? 0) > 0 && (
                <Banner tone="info" title="אולי תוכלו לפתור את זה מיד">
                  <ul className="stack" style={{ gap: 'var(--space-2)', marginTop: 'var(--space-2)' }}>
                    {known.data?.items.slice(0, 3).map((issue) => (
                      <li key={issue.id}>
                        <strong>{issue.title}</strong>
                        <div style={{ fontSize: 'var(--text-sm)' }}>{issue.summary}</div>
                      </li>
                    ))}
                  </ul>
                </Banner>
              )}

              <Card>
                <CardHeader title="פרטי הפנייה" />
                <div className="card__body stack">
                  <TextField
                    label="נושא" required maxLength={220}
                    value={subject}
                    error={errorField === 'subject' ? error : undefined}
                    onChange={(event) => { setSubject(event.target.value); if (errorField === 'subject') { setError(''); setErrorField(null); } }}
                    placeholder="למשל: אין חיבור לאינטרנט במשרד קומה 2"
                  />
                  <TextAreaField
                    label="תיאור מפורט" required
                    value={description}
                    error={errorField === 'description' ? error : undefined}
                    onChange={(event) => { setDescription(event.target.value); if (errorField === 'description') { setError(''); setErrorField(null); } }}
                    placeholder="מה קרה, ממתי, ומה כבר ניסיתם? ככל שיהיו יותר פרטים, הטיפול יהיה מהיר יותר."
                    hint="ציינו מיקום, שעה ומספר עמדה אם רלוונטי"
                  />

                  <div className="grid grid--3">
                    <SelectField
                      label="דחיפות"
                      value={priority}
                      onChange={(event) => setPriority(event.target.value as Priority)}
                    >
                      {PRIORITIES.map((value) => (
                        <option key={value} value={value}>{priorityLabel[value]}</option>
                      ))}
                    </SelectField>

                    {isNewService && (
                      <>
                        <TextField
                          label="עלות משוערת (₪)" type="number" min={0} step={50}
                          value={cost}
                          onChange={(event) => setCost(event.target.value)}
                          hint={category?.cost_threshold != null
                            ? `מעל ${formatCurrency(category.cost_threshold)} נדרש אישור`
                            : undefined}
                        />
                        <TextField
                          label="היקף עבודה משוער (שעות)" type="number" min={0} step={1}
                          value={hours}
                          onChange={(event) => setHours(event.target.value)}
                          hint={category?.hours_threshold != null
                            ? `מעל ${formatHours(category.hours_threshold)} נדרש אישור`
                            : undefined}
                        />
                      </>
                    )}
                  </div>

                  {approvalNotice && (
                    <Banner tone="warning" title="הפנייה תועבר לאישור">
                      {approvalNotice.join(' · ')}. הטיפול יתחיל לאחר קבלת האישור.
                    </Banner>
                  )}
                </div>
              </Card>
            </div>
          )}

          {step === 'media' && (
            <div className="stack">
              <Card>
                <CardHeader icon={<Paperclip size={18} />} title={t('media.title')} />
                <div className="card__body stack">
                  <MediaPicker items={media} onChange={setMedia} disabled={busy} />

                  <Banner tone="info" title={t('media.adviceTitle')}>
                    {t('media.advice')}
                  </Banner>
                </div>
              </Card>

              <Card>
                <CardHeader icon={<Check size={18} />} title={t('media.summaryTitle')} />
                <div className="card__body">
                  <dl className="summary">
                    <div><dt>קטגוריה</dt><dd>{category?.name ?? '—'}</dd></div>
                    {requestType && <div><dt>סוג</dt><dd>{requestType.name}</dd></div>}
                    <div><dt>נושא</dt><dd>{subject.trim() || '—'}</dd></div>
                    <div><dt>דחיפות</dt><dd>{priorityLabel[priority]}</dd></div>
                    <div>
                      <dt>{t('media.attached')}</dt>
                      <dd>{media.length ? t('media.attachedCount', { count: media.length }) : t('media.none')}</dd>
                    </div>
                  </dl>
                </div>
              </Card>
            </div>
          )}
        </div>

        <div className="wizard__nav">
          <Button type="button" variant="ghost" disabled={isFirst} onClick={goBack}
                  icon={<ArrowLeft className="dir-icon" size={16} />}>
            הקודם
          </Button>
          {category?.sla_hours && step === 'details' && (
            <span className="cell-meta">
              <Lightbulb size={13} style={{ verticalAlign: -2 }} />{' '}
              יעד טיפול בקטגוריה זו: {category.sla_hours} שעות
            </span>
          )}
          {uploading && <span className="cell-meta" role="status">{uploading}</span>}
          <span className="grow" />
          <Button type="button" variant="ghost" onClick={() => navigate('/tickets')}>
            ביטול
          </Button>
          {isLast ? (
            <Button type="submit" variant="primary" loading={busy} iconEnd
                    icon={<Send size={17} />}>
              שליחת הקריאה
            </Button>
          ) : (
            <Button type="button" variant="primary" onClick={goNext} iconEnd
                    icon={<ArrowRight className="dir-icon" size={16} />}>
              המשך
            </Button>
          )}
        </div>
      </form>
    </PageFrame>
  );
}
