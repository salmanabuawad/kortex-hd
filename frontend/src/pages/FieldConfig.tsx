import { useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import type { ColDef, ICellRendererParams } from 'ag-grid-community';
import {
  ChevronDown, ChevronUp, Eye, EyeOff, Pin, RotateCcw, Save, Table2,
} from 'lucide-react';

import { del, get, put } from '../lib/api';
import { useAction, useAsync } from '../lib/hooks';
import { DataGrid, widthFromChars, type FieldConfig } from '../components/grid/DataGrid';
import { PageFrame } from '../components/layout/Shell';
import { Banner, Button, ErrorState, Switch } from '../components/ui';
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
  knowledge: [
    { field: 'title', labelKey: 'columns.subject', width: 28 },
    { field: 'category', labelKey: 'columns.category', width: 16 },
    { field: 'summary', labelKey: 'columns.subject', width: 34 },
    { field: 'resolution', labelKey: 'columns.subject', width: 28 },
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

  const columns = useMemo<ColDef<Row>[]>(() => [
    {
      colId: 'order', headerName: t('fieldConfig.order'), width: 110, sortable: false, filter: false,
      cellRenderer: (p: ICellRendererParams<Row>) => {
        const index = rows.findIndex((row) => row.field_name === p.data?.field_name);
        return (
          <span className="row ag-ignore-row-click" style={{ gap: 2 }}>
            <button type="button" className="icon-btn" disabled={index <= 0}
                    aria-label={t('fieldConfig.moveUp')} onClick={() => move(index, -1)}>
              <ChevronUp size={16} />
            </button>
            <button type="button" className="icon-btn" disabled={index >= rows.length - 1}
                    aria-label={t('fieldConfig.moveDown')} onClick={() => move(index, 1)}>
              <ChevronDown size={16} />
            </button>
          </span>
        );
      },
    },
    {
      colId: 'field', headerName: t('fieldConfig.field'), flex: 1, minWidth: 160,
      valueGetter: (p) => p.data?.builtInLabel,
      cellRenderer: (p: ICellRendererParams<Row>) => (
        <span>
          <span className="grid-subject">{p.data?.builtInLabel}</span>
          <span className="cell-number" style={{ display: 'block' }}>{p.data?.field_name}</span>
        </span>
      ),
    },
    {
      colId: 'label_he', headerName: t('fieldConfig.labelHe'), flex: 1, minWidth: 140,
      cellRenderer: (p: ICellRendererParams<Row>) => {
        const index = rows.findIndex((row) => row.field_name === p.data?.field_name);
        return (
          <input className="input ag-ignore-row-click" value={p.data?.label_he ?? ''}
                 placeholder={p.data?.builtInLabel}
                 onChange={(e) => update(index, { label_he: e.target.value })} />
        );
      },
    },
    {
      colId: 'label_ar', headerName: t('fieldConfig.labelAr'), flex: 1, minWidth: 140,
      cellRenderer: (p: ICellRendererParams<Row>) => {
        const index = rows.findIndex((row) => row.field_name === p.data?.field_name);
        return (
          <input className="input ag-ignore-row-click" value={p.data?.label_ar ?? ''}
                 onChange={(e) => update(index, { label_ar: e.target.value })} />
        );
      },
    },
    {
      colId: 'label_en', headerName: t('fieldConfig.labelEn'), flex: 1, minWidth: 140,
      cellRenderer: (p: ICellRendererParams<Row>) => {
        const index = rows.findIndex((row) => row.field_name === p.data?.field_name);
        return (
          <input className="input ltr ag-ignore-row-click" dir="ltr" value={p.data?.label_en ?? ''}
                 onChange={(e) => update(index, { label_en: e.target.value })} />
        );
      },
    },
    {
      colId: 'width', headerName: t('fieldConfig.width'), width: 130,
      cellRenderer: (p: ICellRendererParams<Row>) => {
        const index = rows.findIndex((row) => row.field_name === p.data?.field_name);
        return (
          <span>
            <input className="input ag-ignore-row-click" type="number" min={2} max={120}
                   value={p.data?.width_chars ?? 2}
                   onChange={(e) => update(index, { width_chars: Number(e.target.value) || 2 })} />
            <span className="cell-meta num">
              {widthFromChars(p.data?.width_chars ?? 2, p.data?.padding ?? 0)}px
            </span>
          </span>
        );
      },
    },
    {
      colId: 'visible', headerName: t('fieldConfig.visible'), width: 110, sortable: false, filter: false,
      cellRenderer: (p: ICellRendererParams<Row>) => {
        const index = rows.findIndex((row) => row.field_name === p.data?.field_name);
        return (
          <span className="row ag-ignore-row-click" style={{ gap: 8 }}>
            <Switch checked={!!p.data?.visible} label={t('fieldConfig.visible')}
                    onChange={(value) => update(index, { visible: value })} />
            {p.data?.visible ? <Eye size={16} /> : <EyeOff size={16} />}
          </span>
        );
      },
    },
    {
      colId: 'pinned', headerName: t('fieldConfig.pinned'), width: 110, sortable: false, filter: false,
      cellRenderer: (p: ICellRendererParams<Row>) => {
        const index = rows.findIndex((row) => row.field_name === p.data?.field_name);
        return (
          <span className="row ag-ignore-row-click" style={{ gap: 8 }}>
            <Switch checked={!!p.data?.pinned} label={t('fieldConfig.pinned')}
                    onChange={(value) => update(index, { pinned: value, pin_side: value ? 'right' : null })} />
            {p.data?.pinned && <Pin size={16} />}
          </span>
        );
      },
    },
  ], [rows, t]);

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
      ) : (
        <DataGrid<Row>
          gridName="field-config-editor"
          rows={rows}
          columns={columns}
          loading={saved.loading}
          getRowId={(row) => row.field_name}
          allowLayout={false}
          emptyMessage={t('grid.noRows')}
        />
      )}
    </PageFrame>
  );
}
