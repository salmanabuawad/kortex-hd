import { useCallback, useEffect, useMemo, useState, type FormEvent } from 'react';
import { useTranslation } from 'react-i18next';
import type { ColDef, ICellRendererParams } from 'ag-grid-community';
import {
  Archive, Building2, Clock, Database, LayoutGrid, Layers, LifeBuoy, Network, Pencil,
  Plus, Printer, ShieldCheck, Table2,
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
import { DataGrid } from '../components/grid/DataGrid';
import { useToast } from '../components/ui/toast';

const ICONS: Record<string, React.ReactNode> = {
  Network: <Network size={20} />, Database: <Database size={20} />,
  Printer: <Printer size={20} />, Building2: <Building2 size={20} />,
  ShieldCheck: <ShieldCheck size={20} />, LifeBuoy: <LifeBuoy size={20} />,
};
const ICON_KEYS = Object.keys(ICONS);
const COLORS = ['blue', 'purple', 'green', 'amber', 'red'];
const PRIORITIES: Priority[] = ['low', 'normal', 'high', 'urgent'];
const VIEW_KEY = 'kortex_categories_view';
type CatalogView = 'tiles' | 'grid';

const blank = {
  name: '', description: '', icon: 'LifeBuoy', color: 'blue',
  resolver_id: '', backup_resolver_id: '', escalation_id: '',
  sla_hours: '', default_priority: 'normal' as Priority,
  approval_new_service: false, cost_threshold: '', hours_threshold: '',
  request_type_ids: [] as number[], active: true,
};

function readView(): CatalogView {
  try {
    const stored = localStorage.getItem(VIEW_KEY);
    if (stored === 'grid' || stored === 'tiles') return stored;
  } catch { /* private browsing */ }
  return 'tiles';
}

function approvalSummary(category: Category): string {
  const parts = [
    category.approval_new_service ? 'שירות חדש' : null,
    category.cost_threshold != null ? `עלות מעל ${formatCurrency(category.cost_threshold)}` : null,
    category.hours_threshold != null ? `מעל ${formatHours(category.hours_threshold)}` : null,
  ].filter(Boolean);
  return parts.length ? parts.join(' · ') : 'לא נדרש';
}

export default function Categories() {
  const { t } = useTranslation();
  const toast = useToast();
  const [editing, setEditing] = useState<Category | null>(null);
  const [creating, setCreating] = useState(false);
  const [view, setView] = useState<CatalogView>(readView);

  const categories = useAsync<{ items: Category[] }>(
    () => get<{ items: Category[] }>('/categories?include_inactive=true'), []);
  const people = useAsync<{ items: UserBrief[] }>(
    () => get<{ items: UserBrief[] }>('/users/assignable'), []);
  const types = useAsync<{ items: RequestType[] }>(
    () => get<{ items: RequestType[] }>('/request-types'), []);

  const setCatalogView = (next: CatalogView) => {
    setView(next);
    try { localStorage.setItem(VIEW_KEY, next); } catch { /* private browsing */ }
  };

  const reload = categories.reload;
  const archive = useCallback(async (category: Category) => {
    try {
      const result = await del<{ archived: boolean; tickets?: number }>(
        `/categories/${category.id}`);
      toast.success(result.archived
        ? `הקטגוריה הועברה לארכיון (${result.tickets} קריאות משויכות)`
        : 'הקטגוריה נמחקה');
      reload();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'הפעולה נכשלה');
    }
  }, [reload, toast]);

  const columns = useMemo<ColDef<Category>[]>(() => [
    {
      field: 'name', headerName: 'קטגוריה', flex: 1.4, minWidth: 200,
      cellRenderer: (p: ICellRendererParams<Category>) => p.data ? (
        <span className="row" style={{ gap: 'var(--space-2)' }}>
          <span className={`cat-card__icon cat-card__icon--${p.data.color}`}
                style={{ width: 28, height: 28 }}>
            {ICONS[p.data.icon] ?? <LifeBuoy size={16} />}
          </span>
          <span>
            <strong>{p.data.name}</strong>
            {!p.data.active && (
              <> {' '}<Chip tone="neutral">בארכיון</Chip></>
            )}
          </span>
        </span>
      ) : null,
    },
    {
      field: 'resolver', headerName: 'מטפל', minWidth: 140,
      valueGetter: (p) => p.data?.resolver?.name ?? 'לא הוגדר',
    },
    {
      field: 'escalation', headerName: 'מאשר', minWidth: 140,
      valueGetter: (p) => p.data?.escalation?.name ?? 'לא הוגדר',
    },
    {
      field: 'sla_hours', headerName: 'זמן תקן', minWidth: 110,
      valueGetter: (p) => p.data?.sla_hours ? `${p.data.sla_hours} שעות` : 'לא הוגדר',
    },
    {
      colId: 'types', headerName: 'סוגי בקשה', minWidth: 180, sortable: false,
      valueGetter: (p) => p.data?.request_types.map((type) => type.name).join(', ') ?? '',
    },
    {
      colId: 'actions', headerName: '', minWidth: 220, maxWidth: 280,
      sortable: false, filter: false,
      cellRenderer: (p: ICellRendererParams<Category>) => p.data ? (
        <span className="row ag-ignore-row-click" style={{ gap: 'var(--space-2)' }}>
          <Button size="sm" icon={<Pencil size={14} />}
                  onClick={() => setEditing(p.data!)}>עריכה</Button>
          {p.data.active && (
            <Button size="sm" variant="ghost" icon={<Archive size={14} />}
                    onClick={() => void archive(p.data!)}>
              העברה לארכיון
            </Button>
          )}
        </span>
      ) : null,
    },
  ], [archive]);

  const items = categories.data?.items ?? [];

  return (
    <PageFrame
      fill={view === 'grid'}
      icon={<Layers />}
      title="קטגוריות שירות"
      summary="כל קטגוריה קובעת מי מטפל, מהו זמן התקן, ומתי נדרש אישור"
      actions={
        <div className="row" style={{ gap: 'var(--space-2)', flexWrap: 'wrap' }}>
          <div className="segmented" role="group" aria-label={t('display.view')}>
            <button type="button" aria-pressed={view === 'tiles'}
                    onClick={() => setCatalogView('tiles')}>
              <LayoutGrid /> {t('display.tiles')}
            </button>
            <button type="button" aria-pressed={view === 'grid'}
                    onClick={() => setCatalogView('grid')}>
              <Table2 /> {t('display.grid')}
            </button>
          </div>
          <Button variant="primary" icon={<Plus size={16} />} onClick={() => setCreating(true)}>
            קטגוריה חדשה
          </Button>
        </div>
      }
    >

      {categories.error ? (
        <ErrorState message={categories.error} onRetry={categories.reload} />
      ) : view === 'grid' ? (
        <DataGrid<Category>
          gridName="categories"
          rows={items}
          columns={columns}
          loading={categories.loading}
          getRowId={(row) => String(row.id)}
          onRowClick={(row) => setEditing(row)}
          emptyMessage="אין קטגוריות"
        />
      ) : categories.loading ? (
        <div className="tiles">
          {Array.from({ length: 4 }, (_, i) => <Skeleton key={i} height={220} radius={14} />)}
        </div>
      ) : items.length === 0 ? (
        <Card><div className="card__body"><EmptyState title="אין קטגוריות" /></div></Card>
      ) : (
        <div className="tiles">
          {items.map((category) => (
            <CategoryTile
              key={category.id}
              category={category}
              onEdit={() => setEditing(category)}
              onArchive={() => void archive(category)}
            />
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

function CategoryTile({
  category, onEdit, onArchive,
}: {
  category: Category;
  onEdit: () => void;
  onArchive: () => void;
}) {
  return (
    <Card style={{ opacity: category.active ? 1 : 0.62 }}>
      <div className="cat-card">
        <div className="cat-card__head">
          <span className={`cat-card__icon cat-card__icon--${category.color}`}>
            {ICONS[category.icon] ?? <LifeBuoy size={20} />}
          </span>
          <div className="grow">
            <div className="row row--wrap" style={{ gap: 'var(--space-2)' }}>
              <h3 className="cat-card__name">{category.name}</h3>
              {!category.active && <Chip tone="neutral">בארכיון</Chip>}
            </div>
            {category.description && (
              <p className="cat-card__desc">{category.description}</p>
            )}
          </div>
        </div>

        <div className="cat-card__rules">
          <span>מטפל: <strong>{category.resolver?.name ?? 'לא הוגדר'}</strong></span>
          {category.backup_resolver && (
            <span>מחליף: <strong>{category.backup_resolver.name}</strong></span>
          )}
          <span>מאשר: <strong>{category.escalation?.name ?? 'לא הוגדר'}</strong></span>
          <span>
            <Clock size={14} style={{ verticalAlign: -2 }} />{' '}
            זמן תקן: <strong>
              {category.sla_hours ? `${category.sla_hours} שעות` : 'לא הוגדר'}
            </strong>
            {' · '}דחיפות ברירת מחדל: {priorityLabel[category.default_priority]}
          </span>
          <span>אישור נדרש: <strong>{approvalSummary(category)}</strong></span>
        </div>

        <div className="cat-card__foot">
          <div className="cat-card__types">
            {category.request_types.map((type) => (
              <span key={type.id} className="cat-card__type">{type.name}</span>
            ))}
          </div>
          <div className="cat-card__admin">
            <Button size="sm" icon={<Pencil size={14} />} onClick={onEdit}>
              עריכה
            </Button>
            {category.active && (
              <Button size="sm" variant="ghost" icon={<Archive size={14} />}
                      onClick={onArchive}>
                העברה לארכיון
              </Button>
            )}
          </div>
        </div>
      </div>
    </Card>
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
