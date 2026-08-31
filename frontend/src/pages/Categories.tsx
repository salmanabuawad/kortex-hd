import { useEffect, useState, type FormEvent } from 'react';
import {
  Archive, Building2, Clock, Database, LifeBuoy, Network, Pencil, Plus, Printer, ShieldCheck,
} from 'lucide-react';

import { del, get, patch, post } from '../lib/api';
import { useAction, useAsync } from '../lib/hooks';
import { formatCurrency, formatHours } from '../lib/format';
import { priorityLabel } from '../lib/labels';
import type { Category, Priority, RequestType, UserBrief } from '../lib/types';
import {
  Banner, Button, Card, Chip, Drawer, EmptyState, ErrorState, SelectField,
  Skeleton, Switch, TextAreaField, TextField,
} from '../components/ui';
import { PageFrame } from '../components/layout/Shell';
import { useToast } from '../components/ui/toast';

const ICONS: Record<string, React.ReactNode> = {
  Network: <Network size={20} />, Database: <Database size={20} />,
  Printer: <Printer size={20} />, Building2: <Building2 size={20} />,
  ShieldCheck: <ShieldCheck size={20} />, LifeBuoy: <LifeBuoy size={20} />,
};
const ICON_KEYS = Object.keys(ICONS);
const COLORS = ['blue', 'purple', 'green', 'amber', 'red'];
const PRIORITIES: Priority[] = ['low', 'normal', 'high', 'urgent'];

const blank = {
  name: '', description: '', icon: 'LifeBuoy', color: 'blue',
  resolver_id: '', backup_resolver_id: '', escalation_id: '',
  sla_hours: '', default_priority: 'normal' as Priority,
  approval_new_service: false, cost_threshold: '', hours_threshold: '',
  request_type_ids: [] as number[], active: true,
};

export default function Categories() {
  const toast = useToast();
  const [editing, setEditing] = useState<Category | null>(null);
  const [creating, setCreating] = useState(false);

  const categories = useAsync<{ items: Category[] }>(
    () => get<{ items: Category[] }>('/categories?include_inactive=true'), []);
  const people = useAsync<{ items: UserBrief[] }>(
    () => get<{ items: UserBrief[] }>('/users/assignable'), []);
  const types = useAsync<{ items: RequestType[] }>(
    () => get<{ items: RequestType[] }>('/request-types'), []);

  const archive = async (category: Category) => {
    try {
      const result = await del<{ archived: boolean; tickets?: number }>(
        `/categories/${category.id}`);
      toast.success(result.archived
        ? `הקטגוריה הועברה לארכיון (${result.tickets} קריאות משויכות)`
        : 'הקטגוריה נמחקה');
      categories.reload();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'הפעולה נכשלה');
    }
  };

  return (
    <PageFrame
      reading
      icon={<LifeBuoy />}
      title="קטגוריות שירות"
        summary="כל קטגוריה קובעת מי מטפל, מהו זמן התקן, ומתי נדרש אישור"
        actions={
          <Button variant="primary" icon={<Plus size={16} />} onClick={() => setCreating(true)}>
            קטגוריה חדשה
          </Button>
        }
    >

      {categories.error ? (
        <ErrorState message={categories.error} onRetry={categories.reload} />
      ) : categories.loading ? (
        <div className="grid grid--2">
          {Array.from({ length: 4 }, (_, i) => <Skeleton key={i} height={150} radius={14} />)}
        </div>
      ) : (categories.data?.items.length ?? 0) === 0 ? (
        <Card><div className="card__body"><EmptyState title="אין קטגוריות" /></div></Card>
      ) : (
        <div className="grid grid--2">
          {categories.data?.items.map((category) => (
            <Card key={category.id} style={{ opacity: category.active ? 1 : 0.62 }}>
              <div className="cat-card">
                <span className={`cat-card__icon cat-card__icon--${category.color}`}>
                  {ICONS[category.icon] ?? <LifeBuoy size={20} />}
                </span>
                <div className="grow">
                  <div className="row row--wrap" style={{ gap: 'var(--space-2)' }}>
                    <h3 style={{ fontSize: 'var(--text-md)' }}>{category.name}</h3>
                    {!category.active && <Chip tone="neutral">בארכיון</Chip>}
                  </div>
                  {category.description && (
                    <p className="cell-meta" style={{ marginTop: 2 }}>{category.description}</p>
                  )}

                  <div className="cat-card__rules">
                    <span>מטפל: <strong>{category.resolver?.name ?? 'לא הוגדר'}</strong></span>
                    {category.backup_resolver && (
                      <span>מחליף: {category.backup_resolver.name}</span>
                    )}
                    <span>מאשר: <strong>{category.escalation?.name ?? 'לא הוגדר'}</strong></span>
                    <span>
                      <Clock size={12} style={{ verticalAlign: -2 }} />{' '}
                      זמן תקן: {category.sla_hours ? `${category.sla_hours} שעות` : 'לא הוגדר'}
                      {' · '}דחיפות ברירת מחדל: {priorityLabel[category.default_priority]}
                    </span>
                    <span>
                      אישור נדרש:{' '}
                      {[
                        category.approval_new_service ? 'שירות חדש' : null,
                        category.cost_threshold != null
                          ? `עלות מעל ${formatCurrency(category.cost_threshold)}` : null,
                        category.hours_threshold != null
                          ? `מעל ${formatHours(category.hours_threshold)}` : null,
                      ].filter(Boolean).join(' · ') || 'לא נדרש'}
                    </span>
                    {category.request_types.length > 0 && (
                      <span className="row row--wrap" style={{ gap: 4, marginTop: 4 }}>
                        {category.request_types.map((type) => (
                          <Chip key={type.id} tone="blue">{type.name}</Chip>
                        ))}
                      </span>
                    )}
                  </div>

                  <div className="row" style={{ gap: 'var(--space-2)', marginTop: 'var(--space-3)' }}>
                    <Button size="sm" icon={<Pencil size={14} />}
                            onClick={() => setEditing(category)}>
                      עריכה
                    </Button>
                    {category.active && (
                      <Button size="sm" variant="ghost" icon={<Archive size={14} />}
                              onClick={() => void archive(category)}>
                        העברה לארכיון
                      </Button>
                    )}
                  </div>
                </div>
              </div>
            </Card>
          ))}
        </div>
      )}

      <CategoryDrawer
        open={creating || editing !== null}
        category={editing}
        people={people.data?.items ?? []}
        types={types.data?.items ?? []}
        onClose={() => { setCreating(false); setEditing(null); }}
        onSaved={() => { categories.reload(); setCreating(false); setEditing(null); }}
      />
    </PageFrame>
  );
}

function CategoryDrawer({
  open, category, people, types, onClose, onSaved,
}: {
  open: boolean; category: Category | null; people: UserBrief[]; types: RequestType[];
  onClose: () => void; onSaved: () => void;
}) {
  const toast = useToast();
  const { busy, run } = useAction();
  const [form, setForm] = useState({ ...blank });
  const [error, setError] = useState('');

  useEffect(() => {
    if (!open) return;
    setError('');
    setForm(category ? {
      name: category.name,
      description: category.description ?? '',
      icon: category.icon,
      color: category.color,
      resolver_id: String(category.resolver_id ?? ''),
      backup_resolver_id: String(category.backup_resolver_id ?? ''),
      escalation_id: String(category.escalation_id ?? ''),
      sla_hours: String(category.sla_hours ?? ''),
      default_priority: category.default_priority,
      approval_new_service: category.approval_new_service ?? false,
      cost_threshold: String(category.cost_threshold ?? ''),
      hours_threshold: String(category.hours_threshold ?? ''),
      request_type_ids: category.request_types.map((type) => type.id),
      active: category.active,
    } : { ...blank, request_type_ids: types.map((type) => type.id) });
  }, [open, category, types]);

  const update = <K extends keyof typeof form>(key: K, value: (typeof form)[K]) =>
    setForm((current) => ({ ...current, [key]: value }));

  const submit = (event: FormEvent) => {
    event.preventDefault();
    if (form.name.trim().length < 2) { setError('יש להזין שם לקטגוריה'); return; }
    setError('');

    const body = {
      name: form.name.trim(),
      description: form.description.trim() || null,
      icon: form.icon,
      color: form.color,
      resolver_id: form.resolver_id ? Number(form.resolver_id) : null,
      backup_resolver_id: form.backup_resolver_id ? Number(form.backup_resolver_id) : null,
      escalation_id: form.escalation_id ? Number(form.escalation_id) : null,
      sla_hours: form.sla_hours ? Number(form.sla_hours) : null,
      default_priority: form.default_priority,
      approval_new_service: form.approval_new_service,
      cost_threshold: form.cost_threshold ? Number(form.cost_threshold) : null,
      hours_threshold: form.hours_threshold ? Number(form.hours_threshold) : null,
      request_type_ids: form.request_type_ids,
      active: form.active,
    };

    void run(
      () => (category ? patch(`/categories/${category.id}`, body) : post('/categories', body)),
      {
        onSuccess: () => { toast.success(category ? 'הקטגוריה עודכנה' : 'נוצרה קטגוריה'); onSaved(); },
        onError: setError,
      },
    );
  };

  return (
    <Drawer
      open={open} onClose={onClose}
      title={category ? `עריכת ${category.name}` : 'קטגוריה חדשה'}
      footer={
        <>
          <Button variant="primary" loading={busy} type="submit" form="category-form">
            שמירה
          </Button>
          <Button variant="ghost" onClick={onClose}>ביטול</Button>
        </>
      }
    >
      <form id="category-form" className="stack" onSubmit={submit}>
        {error && <Banner tone="danger">{error}</Banner>}

        <TextField
          label="שם הקטגוריה" required value={form.name}
          onChange={(event) => update('name', event.target.value)}
        />
        <TextAreaField
          label="תיאור" value={form.description}
          onChange={(event) => update('description', event.target.value)}
          placeholder="מה נכלל בקטגוריה זו — מוצג לפונה בעת פתיחת קריאה"
        />

        <div className="field">
          <span className="field__label">סמל וצבע</span>
          <div className="row row--wrap" style={{ gap: 'var(--space-2)' }}>
            {ICON_KEYS.map((key) => (
              <button
                key={key} type="button"
                className={`choice${form.icon === key ? ' choice--selected' : ''}`}
                style={{ padding: 'var(--space-2)' }}
                aria-pressed={form.icon === key}
                aria-label={key}
                onClick={() => update('icon', key)}
              >
                <span className="choice__icon">{ICONS[key]}</span>
              </button>
            ))}
          </div>
          <div className="row row--wrap" style={{ gap: 'var(--space-2)', marginTop: 'var(--space-2)' }}>
            {COLORS.map((color) => (
              <button
                key={color} type="button" aria-label={color}
                aria-pressed={form.color === color}
                onClick={() => update('color', color)}
                className={`cat-card__icon cat-card__icon--${color}`}
                style={{
                  width: 30, height: 30, cursor: 'pointer',
                  border: form.color === color
                    ? '2px solid var(--primary)' : '2px solid transparent',
                }}
              />
            ))}
          </div>
        </div>

        <h4 style={{ marginTop: 'var(--space-2)' }}>ניתוב</h4>
        <SelectField
          label="מטפל ראשי" value={form.resolver_id}
          hint="קריאות בקטגוריה זו יוקצו אליו אוטומטית"
          onChange={(event) => update('resolver_id', event.target.value)}
        >
          <option value="">לא הוגדר</option>
          {people.map((person) => (
            <option key={person.id} value={person.id}>{person.name}</option>
          ))}
        </SelectField>
        <SelectField
          label="מטפל מחליף" value={form.backup_resolver_id}
          onChange={(event) => update('backup_resolver_id', event.target.value)}
        >
          <option value="">לא הוגדר</option>
          {people.map((person) => (
            <option key={person.id} value={person.id}>{person.name}</option>
          ))}
        </SelectField>
        <SelectField
          label="גורם מאשר / הסלמה" value={form.escalation_id}
          hint="אליו יופנו בקשות האישור בקטגוריה זו"
          onChange={(event) => update('escalation_id', event.target.value)}
        >
          <option value="">לא הוגדר</option>
          {people.map((person) => (
            <option key={person.id} value={person.id}>{person.name}</option>
          ))}
        </SelectField>

        <h4 style={{ marginTop: 'var(--space-2)' }}>זמן תקן ודחיפות</h4>
        <div className="grid grid--2">
          <TextField
            label="זמן תקן (שעות)" type="number" min={1} value={form.sla_hours}
            onChange={(event) => update('sla_hours', event.target.value)}
            hint="ריק = ללא יעד"
          />
          <SelectField
            label="דחיפות ברירת מחדל" value={form.default_priority}
            onChange={(event) => update('default_priority', event.target.value as Priority)}
          >
            {PRIORITIES.map((value) => (
              <option key={value} value={value}>{priorityLabel[value]}</option>
            ))}
          </SelectField>
        </div>

        {/* Approval configuration grouped together, as one decision. */}
        <h4 style={{ marginTop: 'var(--space-2)' }}>כללי אישור</h4>
        <Card>
          <div className="card__body stack">
            <label className="checkbox">
              <input
                type="checkbox" checked={form.approval_new_service}
                onChange={(event) => update('approval_new_service', event.target.checked)}
              />
              <span>
                <span className="checkbox__text">בקשה לשירות חדש מחייבת אישור</span>
                <span className="checkbox__hint" style={{ display: 'block' }}>
                  חל על פניות שסווגו כ״שירות חדש״
                </span>
              </span>
            </label>
            <div className="grid grid--2">
              <TextField
                label="סף עלות (₪)" type="number" min={0} value={form.cost_threshold}
                onChange={(event) => update('cost_threshold', event.target.value)}
                hint="מעל סכום זה נדרש אישור. ריק = ללא סף"
              />
              <TextField
                label="סף שעות עבודה" type="number" min={0} value={form.hours_threshold}
                onChange={(event) => update('hours_threshold', event.target.value)}
                hint="מעל היקף זה נדרש אישור. ריק = ללא סף"
              />
            </div>
          </div>
        </Card>

        <h4 style={{ marginTop: 'var(--space-2)' }}>סוגי בקשה מותרים</h4>
        <div className="stack" style={{ gap: 'var(--space-2)' }}>
          {types.map((type) => (
            <label className="checkbox" key={type.id}>
              <input
                type="checkbox"
                checked={form.request_type_ids.includes(type.id)}
                onChange={(event) => update(
                  'request_type_ids',
                  event.target.checked
                    ? [...form.request_type_ids, type.id]
                    : form.request_type_ids.filter((id) => id !== type.id),
                )}
              />
              <span className="checkbox__text">{type.name}</span>
            </label>
          ))}
        </div>

        <div className="row" style={{ marginTop: 'var(--space-3)' }}>
          <Switch
            checked={form.active} label="קטגוריה פעילה"
            onChange={(value) => update('active', value)}
          />
          <span>קטגוריה פעילה (מוצגת בטופס פתיחת קריאה)</span>
        </div>
      </form>
    </Drawer>
  );
}
