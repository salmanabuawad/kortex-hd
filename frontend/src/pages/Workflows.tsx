import { useEffect, useState, type FormEvent } from 'react';
import { Plus, Trash2, Workflow as WorkflowIcon } from 'lucide-react';

import { del, get, patch, post } from '../lib/api';
import { useAction, useAsync } from '../lib/hooks';
import { formatCurrency, formatHours } from '../lib/format';
import type { Category, RequestType, UserBrief, WorkflowRule } from '../lib/types';
import {
  Banner, Button, Card, Chip, Dialog, EmptyState, ErrorState, PageHeader, SelectField,
  SkeletonRows, Switch, TextAreaField, TextField,
} from '../components/ui';
import { useToast } from '../components/ui/toast';

/** Renders a rule as a sentence a non-developer can read. */
function conditionChips(rule: WorkflowRule) {
  const chips: string[] = [];
  if (rule.category) chips.push(`קטגוריה: ${rule.category}`);
  if (rule.request_type) chips.push(`סוג בקשה: ${rule.request_type}`);
  if (rule.cost_gt !== null) chips.push(`עלות מעל ${formatCurrency(rule.cost_gt)}`);
  if (rule.hours_gt !== null) chips.push(`היקף מעל ${formatHours(rule.hours_gt)}`);
  return chips.length ? chips : ['כל הקריאות'];
}

export default function Workflows() {
  const toast = useToast();
  const [editing, setEditing] = useState<WorkflowRule | null>(null);
  const [creating, setCreating] = useState(false);

  const rules = useAsync<{ items: WorkflowRule[] }>(
    () => get<{ items: WorkflowRule[] }>('/workflow-rules'), []);
  const categories = useAsync<{ items: Category[] }>(
    () => get<{ items: Category[] }>('/categories?include_inactive=true'), []);
  const types = useAsync<{ items: RequestType[] }>(
    () => get<{ items: RequestType[] }>('/request-types'), []);
  const people = useAsync<{ items: UserBrief[] }>(
    () => get<{ items: UserBrief[] }>('/users/assignable'), []);

  const toggle = async (rule: WorkflowRule) => {
    try {
      await patch(`/workflow-rules/${rule.id}`, {
        name: rule.name, description: rule.description, active: !rule.active,
        category_id: rule.category_id, request_type_id: rule.request_type_id,
        cost_gt: rule.cost_gt, hours_gt: rule.hours_gt,
        approver_id: rule.approver_id, sort_order: rule.sort_order,
      });
      rules.reload();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'הפעולה נכשלה');
    }
  };

  const remove = async (rule: WorkflowRule) => {
    try {
      await del(`/workflow-rules/${rule.id}`);
      toast.success('הכלל נמחק');
      rules.reload();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'המחיקה נכשלה');
    }
  };

  return (
    <>
      <PageHeader
        title="כללי תהליך"
        subtitle="מתי קריאה מחייבת אישור, ומי הגורם המאשר"
        actions={
          <Button variant="primary" icon={<Plus size={16} />} onClick={() => setCreating(true)}>
            כלל חדש
          </Button>
        }
      />

      <Banner tone="info">
        כללים אלה נבדקים בנוסף לספי האישור שהוגדרו בכל קטגוריה. אם קריאה עונה על כלל,
        נוצרת בקשת אישור והטיפול ממתין להחלטה.
      </Banner>

      <div style={{ height: 'var(--space-4)' }} />

      {rules.error ? (
        <ErrorState message={rules.error} onRetry={rules.reload} />
      ) : rules.loading ? (
        <SkeletonRows rows={3} />
      ) : (rules.data?.items.length ?? 0) === 0 ? (
        <Card>
          <div className="card__body">
            <EmptyState
              icon={<WorkflowIcon />}
              title="לא הוגדרו כללי תהליך"
              text="ניתן להגדיר כלל שמחייב אישור לפי קטגוריה, סוג בקשה, עלות או היקף עבודה."
              action={
                <Button variant="primary" icon={<Plus size={16} />}
                        onClick={() => setCreating(true)}>
                  יצירת כלל
                </Button>
              }
            />
          </div>
        </Card>
      ) : (
        <div className="stack">
          {rules.data?.items.map((rule) => (
            <Card key={rule.id} style={{ opacity: rule.active ? 1 : 0.6 }}>
              <div className="rule-card">
                <div className="row" style={{ marginBottom: 'var(--space-3)' }}>
                  <span className="kpi__icon kpi__icon--purple">
                    <WorkflowIcon size={18} />
                  </span>
                  <div className="grow">
                    <h3 style={{ fontSize: 'var(--text-md)' }}>{rule.name}</h3>
                    {rule.description && (
                      <p className="cell-meta">{rule.description}</p>
                    )}
                  </div>
                  <Switch
                    checked={rule.active} label="כלל פעיל"
                    onChange={() => void toggle(rule)}
                  />
                </div>

                <div className="rule-clause">
                  <span className="rule-clause__key rule-clause__key--when">כאשר</span>
                  <div className="rule-conditions">
                    {conditionChips(rule).map((text) => (
                      <Chip key={text} tone="blue">{text}</Chip>
                    ))}
                  </div>
                </div>

                <div className="rule-clause">
                  <span className="rule-clause__key rule-clause__key--then">אז</span>
                  <div className="rule-conditions">
                    <Chip tone="purple">
                      נדרש אישור מאת {rule.approver?.name ?? 'הגורם המאשר בקטגוריה'}
                    </Chip>
                  </div>
                </div>

                <div className="row" style={{ gap: 'var(--space-2)', marginTop: 'var(--space-4)' }}>
                  <Button size="sm" onClick={() => setEditing(rule)}>עריכה</Button>
                  <Button size="sm" variant="danger" icon={<Trash2 size={14} />}
                          onClick={() => void remove(rule)}>
                    מחיקה
                  </Button>
                </div>
              </div>
            </Card>
          ))}
        </div>
      )}

      <RuleDialog
        open={creating || editing !== null}
        rule={editing}
        categories={categories.data?.items ?? []}
        types={types.data?.items ?? []}
        people={people.data?.items ?? []}
        onClose={() => { setCreating(false); setEditing(null); }}
        onSaved={() => { rules.reload(); setCreating(false); setEditing(null); }}
      />
    </>
  );
}

function RuleDialog({
  open, rule, categories, types, people, onClose, onSaved,
}: {
  open: boolean; rule: WorkflowRule | null; categories: Category[];
  types: RequestType[]; people: UserBrief[]; onClose: () => void; onSaved: () => void;
}) {
  const toast = useToast();
  const { busy, run } = useAction();
  const [error, setError] = useState('');
  const [form, setForm] = useState({
    name: '', description: '', category_id: '', request_type_id: '',
    cost_gt: '', hours_gt: '', approver_id: '', active: true,
  });

  useEffect(() => {
    if (!open) return;
    setError('');
    setForm({
      name: rule?.name ?? '',
      description: rule?.description ?? '',
      category_id: String(rule?.category_id ?? ''),
      request_type_id: String(rule?.request_type_id ?? ''),
      cost_gt: String(rule?.cost_gt ?? ''),
      hours_gt: String(rule?.hours_gt ?? ''),
      approver_id: String(rule?.approver_id ?? ''),
      active: rule?.active ?? true,
    });
  }, [open, rule]);

  const update = (key: keyof typeof form, value: string | boolean) =>
    setForm((current) => ({ ...current, [key]: value }));

  const submit = (event: FormEvent) => {
    event.preventDefault();
    if (form.name.trim().length < 2) { setError('יש להזין שם לכלל'); return; }
    if (!form.category_id && !form.request_type_id && !form.cost_gt && !form.hours_gt) {
      setError('יש להגדיר לפחות תנאי אחד, אחרת הכלל יחול על כל קריאה'); return;
    }
    setError('');

    const body = {
      name: form.name.trim(),
      description: form.description.trim() || null,
      active: form.active,
      category_id: form.category_id ? Number(form.category_id) : null,
      request_type_id: form.request_type_id ? Number(form.request_type_id) : null,
      cost_gt: form.cost_gt ? Number(form.cost_gt) : null,
      hours_gt: form.hours_gt ? Number(form.hours_gt) : null,
      approver_id: form.approver_id ? Number(form.approver_id) : null,
      sort_order: rule?.sort_order ?? 0,
    };

    void run(
      () => (rule ? patch(`/workflow-rules/${rule.id}`, body) : post('/workflow-rules', body)),
      {
        onSuccess: () => { toast.success(rule ? 'הכלל עודכן' : 'נוצר כלל'); onSaved(); },
        onError: setError,
      },
    );
  };

  return (
    <Dialog
      open={open} onClose={onClose} wide
      title={rule ? 'עריכת כלל' : 'כלל תהליך חדש'}
      footer={
        <>
          <Button variant="primary" loading={busy} type="submit" form="rule-form">שמירה</Button>
          <Button variant="ghost" onClick={onClose}>ביטול</Button>
        </>
      }
    >
      <form id="rule-form" className="stack" onSubmit={submit}>
        {error && <Banner tone="danger">{error}</Banner>}

        <TextField
          label="שם הכלל" required value={form.name}
          placeholder="למשל: רכש מעל 3,000 ₪ מחייב אישור גזבר"
          onChange={(event) => update('name', event.target.value)}
        />
        <TextAreaField
          label="הסבר" value={form.description}
          onChange={(event) => update('description', event.target.value)}
          placeholder="מדוע הכלל קיים — מוצג למנהלי המערכת בלבד"
        />

        <Card>
          <div className="card__body stack">
            <div className="row">
              <span className="rule-clause__key rule-clause__key--when">כאשר</span>
              <span className="cell-meta">כל התנאים שתמלאו חייבים להתקיים יחד</span>
            </div>
            <div className="grid grid--2">
              <SelectField
                label="קטגוריה" value={form.category_id}
                onChange={(event) => update('category_id', event.target.value)}
              >
                <option value="">כל הקטגוריות</option>
                {categories.map((category) => (
                  <option key={category.id} value={category.id}>{category.name}</option>
                ))}
              </SelectField>
              <SelectField
                label="סוג בקשה" value={form.request_type_id}
                onChange={(event) => update('request_type_id', event.target.value)}
              >
                <option value="">כל הסוגים</option>
                {types.map((type) => (
                  <option key={type.id} value={type.id}>{type.name}</option>
                ))}
              </SelectField>
            </div>
            <div className="grid grid--2">
              <TextField
                label="עלות משוערת גבוהה מ־ (₪)" type="number" min={0} value={form.cost_gt}
                onChange={(event) => update('cost_gt', event.target.value)}
                hint="ריק = ללא תנאי עלות"
              />
              <TextField
                label="היקף עבודה גבוה מ־ (שעות)" type="number" min={0} value={form.hours_gt}
                onChange={(event) => update('hours_gt', event.target.value)}
                hint="ריק = ללא תנאי היקף"
              />
            </div>
          </div>
        </Card>

        <Card>
          <div className="card__body stack">
            <div className="row">
              <span className="rule-clause__key rule-clause__key--then">אז</span>
              <span className="cell-meta">מה קורה כשהתנאים מתקיימים</span>
            </div>
            <SelectField
              label="נדרש אישור מאת" value={form.approver_id}
              hint="אם לא נבחר, הבקשה תופנה לגורם המאשר שהוגדר בקטגוריה"
              onChange={(event) => update('approver_id', event.target.value)}
            >
              <option value="">הגורם המאשר של הקטגוריה</option>
              {people.map((person) => (
                <option key={person.id} value={person.id}>{person.name}</option>
              ))}
            </SelectField>
          </div>
        </Card>

        <div className="row">
          <Switch checked={form.active} label="כלל פעיל"
                  onChange={(value) => update('active', value)} />
          <span>הכלל פעיל</span>
        </div>
      </form>
    </Dialog>
  );
}
