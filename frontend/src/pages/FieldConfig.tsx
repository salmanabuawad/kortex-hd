import { useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import {
  ChevronDown, ChevronUp, Eye, EyeOff, Pin, RotateCcw, Save, Table2,
} from 'lucide-react';

import { del, get, put } from '../lib/api';
import { useAction, useAsync } from '../lib/hooks';
import type { FieldConfig } from '../components/grid/DataGrid';
import { widthFromChars } from '../components/grid/DataGrid';
import { PageFrame } from '../components/layout/Shell';
import { Banner, Button, Card, ErrorState, SkeletonRows, Switch } from '../components/ui';
import { useToast } from '../components/ui/toast';

/** The columns each grid offers. Kept here rather than derived from the page so
 *  an administrator can re-add a column they previously hid. */
const GRID_FIELDS: Record<string, { field: string; labelKey: string; width: number }[]> = {
  tickets: [
    { field: 'number', labelKey: 'columns.number', width: 12 },
    { field: 'subject', labelKey: 'columns.subject', width: 34 },
    { field: 'category', labelKey: 'columns.category', width: 16 },
    { field: 'request_type', labelKey: 'columns.requestType', width: 14 },
    { field: 'requester', labelKey: 'columns.requester', width: 16 },
    { field: 'resolver', labelKey: 'columns.resolver', width: 16 },
    { field: 'priority', labelKey: 'columns.priority', width: 11 },
    { field: 'status', labelKey: 'columns.status', width: 13 },
    { field: 'sla', labelKey: 'columns.sla', width: 12 },
    { field: 'updated_at', labelKey: 'columns.updated', width: 13 },
    { field: 'created_at', labelKey: 'columns.created', width: 13 },
  ],
  approvals: [
    { field: 'ticket_number', labelKey: 'columns.number', width: 12 },
    { field: 'ticket_subject', labelKey: 'columns.subject', width: 30 },
    { field: 'category', labelKey: 'columns.category', width: 16 },
    { field: 'reason', labelKey: 'columns.subject', width: 28 },
    { field: 'status', labelKey: 'columns.status', width: 12 },
    { field: 'requested_at', labelKey: 'columns.created', width: 13 },
  ],
  directory: [
    { field: 'full_name', labelKey: 'columns.name', width: 20 },
    { field: 'email', labelKey: 'columns.email', width: 24 },
    { field: 'phone', labelKey: 'columns.phone', width: 14 },
    { field: 'role', labelKey: 'columns.role', width: 12 },
    { field: 'department', labelKey: 'columns.department', width: 18 },
  ],
  subtasks: [
    { field: 'number', labelKey: 'columns.number', width: 14 },
    { field: 'title', labelKey: 'columns.subject', width: 30 },
    { field: 'assignee', labelKey: 'columns.assignee', width: 18 },
    { field: 'status', labelKey: 'columns.status', width: 12 },
    { field: 'due_date', labelKey: 'columns.dueDate', width: 13 },
  ],
};

interface Row extends FieldConfig {
  builtInLabel: string;
}

export default function FieldConfigPage() {
  const { t } = useTranslation();
  const toast = useToast();
  const { busy, run } = useAction();

  const grids = useAsync<{ items: { name: string; label: string }[] }>(
    () => get<{ items: { name: string; label: string }[] }>('/grids'), []);
  const [grid, setGrid] = useState('tickets');
  const [rows, setRows] = useState<Row[]>([]);
  const [dirty, setDirty] = useState(false);

  const saved = useAsync<{ items: FieldConfig[] }>(
    () => get<{ items: FieldConfig[] }>(`/field-configurations?grid_name=${grid}`), [grid]);

  // Merge the stored configuration over the built-in field list, so fields that
  // have never been configured still appear and can be edited.
  useEffect(() => {
    if (!saved.data) return;
    const known = GRID_FIELDS[grid] ?? [];
    const byField = new Map(saved.data.items.map((item) => [item.field_name, item]));

    const merged: Row[] = known.map((field, index) => {
      const stored = byField.get(field.field);
      return {
        field_name: field.field,
        builtInLabel: t(field.labelKey),
        label_he: stored?.label_he ?? null,
        label_en: stored?.label_en ?? null,
        label_ar: stored?.label_ar ?? null,
        width_chars: stored?.width_chars ?? field.width,
        padding: stored?.padding ?? 24,
        visible: stored?.visible ?? true,
        pinned: stored?.pinned ?? false,
        pin_side: stored?.pin_side ?? null,
        column_order: stored?.column_order ?? index,
      };
    });
    merged.sort((a, b) => a.column_order - b.column_order);
    setRows(merged);
    setDirty(false);
  }, [saved.data, grid, t]);

  const update = (index: number, patch: Partial<Row>) => {
    setRows((current) => current.map((row, i) => (i === index ? { ...row, ...patch } : row)));
    setDirty(true);
  };

  const move = (index: number, delta: number) => {
    const target = index + delta;
    if (target < 0 || target >= rows.length) return;
    setRows((current) => {
      const next = [...current];
      [next[index], next[target]] = [next[target], next[index]];
      return next.map((row, i) => ({ ...row, column_order: i }));
    });
    setDirty(true);
  };

  const save = () => {
    void run(
      () => put(`/field-configurations/${grid}`, {
        fields: rows.map((row) => ({
          field_name: row.field_name,
          label_he: row.label_he || null,
          label_en: row.label_en || null,
          label_ar: row.label_ar || null,
          width_chars: row.width_chars,
          padding: row.padding,
          visible: row.visible,
          pinned: row.pinned,
          pin_side: row.pinned ? (row.pin_side ?? 'right') : null,
        })),
      }),
      {
        onSuccess: () => { setDirty(false); toast.success(t('fieldConfig.saved')); saved.reload(); },
        onError: (message) => toast.error(message),
      },
    );
  };

  const reset = () => {
    if (!window.confirm(t('fieldConfig.resetConfirm'))) return;
    void run(() => del(`/field-configurations/${grid}`), {
      onSuccess: () => { toast.success(t('actions.reset')); saved.reload(); },
      onError: (message) => toast.error(message),
    });
  };

  const visibleCount = useMemo(() => rows.filter((r) => r.visible).length, [rows]);

  return (
    <PageFrame
      reading
      icon={<Table2 />}
      title={t('fieldConfig.title')}
      summary={`${visibleCount} / ${rows.length}`}
      actions={
        <>
          <Button variant="primary" icon={<Save size={16} />} loading={busy}
                  disabled={!dirty} onClick={save}>
            {t('actions.save')}
          </Button>
          <Button variant="ghost" icon={<RotateCcw size={16} />} onClick={reset}>
            {t('fieldConfig.resetToDefaults')}
          </Button>
        </>
      }
      filters={
        <select
          className="select" value={grid} aria-label={t('fieldConfig.grid')}
          onChange={(event) => setGrid(event.target.value)}
        >
          {grids.data?.items.map((item) => (
            <option key={item.name} value={item.name}>{item.label}</option>
          ))}
        </select>
      }
    >
      <Banner tone="info">{t('fieldConfig.defaultsNote')}</Banner>

      {saved.error ? (
        <ErrorState message={saved.error} onRetry={saved.reload} />
      ) : saved.loading ? (
        <Card><div className="card__body"><SkeletonRows rows={6} /></div></Card>
      ) : (
        <Card>
          <div className="card__body card__body--flush">
            <div className="table-wrap">
              <table className="table">
                <thead>
                  <tr>
                    <th style={{ width: 90 }}>{t('fieldConfig.order')}</th>
                    <th>{t('fieldConfig.field')}</th>
                    <th>{t('fieldConfig.labelHe')}</th>
                    <th>{t('fieldConfig.labelAr')}</th>
                    <th>{t('fieldConfig.labelEn')}</th>
                    <th style={{ width: 130 }}>{t('fieldConfig.width')}</th>
                    <th style={{ width: 90 }}>{t('fieldConfig.visible')}</th>
                    <th style={{ width: 90 }}>{t('fieldConfig.pinned')}</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((row, index) => (
                    <tr key={row.field_name} style={{ opacity: row.visible ? 1 : 0.55 }}>
                      <td data-label={t('fieldConfig.order')}>
                        <div className="row" style={{ gap: 2 }}>
                          <button type="button" className="icon-btn" disabled={index === 0}
                                  aria-label={t('fieldConfig.moveUp')}
                                  onClick={() => move(index, -1)}>
                            <ChevronUp size={15} />
                          </button>
                          <button type="button" className="icon-btn"
                                  disabled={index === rows.length - 1}
                                  aria-label={t('fieldConfig.moveDown')}
                                  onClick={() => move(index, 1)}>
                            <ChevronDown size={15} />
                          </button>
                        </div>
                      </td>
                      <td data-label={t('fieldConfig.field')}>
                        <div style={{ fontWeight: 600 }}>{row.builtInLabel}</div>
                        <div className="cell-number">{row.field_name}</div>
                      </td>
                      <td data-label={t('fieldConfig.labelHe')}>
                        <input className="input" value={row.label_he ?? ''}
                               placeholder={row.builtInLabel}
                               onChange={(e) => update(index, { label_he: e.target.value })} />
                      </td>
                      <td data-label={t('fieldConfig.labelAr')}>
                        <input className="input" value={row.label_ar ?? ''}
                               onChange={(e) => update(index, { label_ar: e.target.value })} />
                      </td>
                      <td data-label={t('fieldConfig.labelEn')}>
                        <input className="input ltr" dir="ltr" value={row.label_en ?? ''}
                               onChange={(e) => update(index, { label_en: e.target.value })} />
                      </td>
                      <td data-label={t('fieldConfig.width')}>
                        <input className="input" type="number" min={2} max={120}
                               value={row.width_chars}
                               onChange={(e) => update(index,
                                 { width_chars: Number(e.target.value) || 2 })} />
                        <div className="cell-meta num">
                          {widthFromChars(row.width_chars, row.padding)}px
                        </div>
                      </td>
                      <td data-label={t('fieldConfig.visible')}>
                        <div className="row" style={{ gap: 'var(--space-2)' }}>
                          <Switch checked={row.visible} label={t('fieldConfig.visible')}
                                  onChange={(value) => update(index, { visible: value })} />
                          {row.visible ? <Eye size={15} /> : <EyeOff size={15} />}
                        </div>
                      </td>
                      <td data-label={t('fieldConfig.pinned')}>
                        <div className="row" style={{ gap: 'var(--space-2)' }}>
                          <Switch checked={row.pinned} label={t('fieldConfig.pinned')}
                                  onChange={(value) => update(index,
                                    { pinned: value, pin_side: value ? 'right' : null })} />
                          {row.pinned && <Pin size={15} />}
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </Card>
      )}
    </PageFrame>
  );
}
