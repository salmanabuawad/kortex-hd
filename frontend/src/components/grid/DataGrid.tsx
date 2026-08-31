import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { AgGridReact } from 'ag-grid-react';
import {
  AllCommunityModule, ModuleRegistry,
  type ColDef, type GridApi, type GridReadyEvent,
} from 'ag-grid-community';

// The v34 Theming API and the legacy ag-theme-* classes are mutually exclusive.
// Mixing them left AG Grid's own header logic half-initialised and it rendered
// every column label with visibility:hidden. We use the legacy CSS themes,
// because the whole visual definition here is driven by --ag-* variables that
// map onto our design tokens.
import 'ag-grid-community/styles/ag-grid.css';
import 'ag-grid-community/styles/ag-theme-quartz.css';
import { RotateCcw, Save } from 'lucide-react';

import { del, get, put } from '../../lib/api';
import { useDisplay } from '../../lib/display';
import { Button } from '../ui';
import { useToast } from '../ui/toast';

ModuleRegistry.registerModules([AllCommunityModule]);

export interface FieldConfig {
  field_name: string;
  label_he: string | null;
  label_en: string | null;
  label_ar: string | null;
  width_chars: number;
  padding: number;
  visible: boolean;
  pinned: boolean;
  pin_side: 'left' | 'right' | null;
  column_order: number;
}

/** Characters to pixels. Matches the buildings-manager convention so an
 *  administrator who knows one system can configure the other. */
export function widthFromChars(chars: number, padding: number, scale = 1): number {
  return Math.round((chars * 8.5 + padding) * scale);
}

const FONT_SCALE: Record<string, number> = { small: 0.9, normal: 1, large: 1.45 };

function labelFor(config: FieldConfig, language: string): string | null {
  if (language === 'en') return config.label_en || null;
  if (language === 'ar') return config.label_ar || null;
  return config.label_he || null;
}

/**
 * Applies the administrator's field configuration on top of the code-defined
 * columns, then the user's own saved column state on top of that.
 */
export function useConfiguredColumns<T>(
  gridName: string,
  columns: ColDef<T>[],
): { columns: ColDef<T>[]; ready: boolean; configs: FieldConfig[] } {
  const { i18n } = useTranslation();
  const { fontSize } = useDisplay();
  const [configs, setConfigs] = useState<FieldConfig[] | null>(null);

  useEffect(() => {
    let active = true;
    void get<{ items: FieldConfig[] }>(`/field-configurations?grid_name=${gridName}`)
      .then((result) => { if (active) setConfigs(result.items); })
      .catch(() => { if (active) setConfigs([]); });
    return () => { active = false; };
  }, [gridName]);

  const configured = useMemo(() => {
    if (!configs) return columns;
    const scale = FONT_SCALE[fontSize] ?? 1;
    const byField = new Map(configs.map((c) => [c.field_name, c]));

    const applied = columns
      .map((column) => {
        const key = String(column.colId ?? column.field ?? '');
        const config = byField.get(key);
        if (!config) return { column, order: Number.MAX_SAFE_INTEGER };
        if (!config.visible) return null;

        const label = labelFor(config, i18n.language);
        const width = widthFromChars(config.width_chars, config.padding, scale);
        return {
          column: {
            ...column,
            headerName: label ?? column.headerName,
            // Keep the configured width as a floor and let a flex column take
            // the remaining space, so the table fills the viewport instead of
            // leaving a dead gutter at the end.
            ...(column.flex ? { flex: column.flex, minWidth: width } : { width }),
            pinned: config.pinned ? (config.pin_side ?? 'right') : undefined,
          } as ColDef<T>,
          order: config.column_order,
        };
      })
      .filter((entry): entry is { column: ColDef<T>; order: number } => entry !== null)
      .sort((a, b) => a.order - b.order)
      .map((entry) => entry.column);

    return applied;
  }, [columns, configs, i18n.language, fontSize]);

  return { columns: configured, ready: configs !== null, configs: configs ?? [] };
}

interface DataGridProps<T> {
  gridName: string;
  rows: T[];
  columns: ColDef<T>[];
  loading?: boolean;
  onRowClick?: (row: T) => void;
  getRowId?: (row: T) => string;
  /** Show the save/reset column-layout toolbar. */
  allowLayout?: boolean;
  emptyMessage?: string;
  height?: number | string;
}

export function DataGrid<T extends object>({
  gridName, rows, columns, loading, onRowClick, getRowId,
  allowLayout = true, emptyMessage, height,
}: DataGridProps<T>) {
  const { t, i18n } = useTranslation();
  const toast = useToast();
  const { fontSize, contrast } = useDisplay();
  const apiRef = useRef<GridApi<T> | null>(null);
  const [dirty, setDirty] = useState(false);

  const { columns: configured, ready } = useConfiguredColumns(gridName, columns);

  const defaultColDef = useMemo<ColDef<T>>(() => ({
    sortable: true,
    resizable: true,
    filter: true,
    suppressHeaderMenuButton: false,
    minWidth: 80,
  }), []);

  // True once the user has a saved layout: their widths win from then on, and
  // we stop auto-fitting over the top of them.
  const hasOwnLayout = useRef(false);

  /** Configured widths rarely add up to the viewport exactly, which left a dead
   *  strip at the end of the table. Stretch to fill unless the user has saved
   *  a layout of their own. minWidth on each column is respected, so the
   *  administrator's widths still act as floors. */
  const fitColumns = useCallback(() => {
    const api = apiRef.current;
    if (!api || hasOwnLayout.current) return;
    api.sizeColumnsToFit();
  }, []);

  // Restore the user's own column state once the grid exists.
  const onGridReady = useCallback((event: GridReadyEvent<T>) => {
    apiRef.current = event.api;
    void get<{ state: unknown }>(`/grid-preferences/${gridName}`)
      .then((saved) => {
        if (Array.isArray(saved.state) && saved.state.length) {
          hasOwnLayout.current = true;
          event.api.applyColumnState({
            state: saved.state as never,
            applyOrder: true,
          });
        } else {
          event.api.sizeColumnsToFit();
        }
      })
      .catch(() => event.api.sizeColumnsToFit());
  }, [gridName]);

  const saveLayout = useCallback(() => {
    const api = apiRef.current;
    if (!api) return;
    void put(`/grid-preferences/${gridName}`, { state: api.getColumnState() })
      .then(() => {
        hasOwnLayout.current = true;
        setDirty(false);
        toast.success(t('grid.layoutSaved'));
      })
      .catch(() => toast.error(t('common.errorTitle')));
  }, [gridName, t, toast]);

  const resetLayout = useCallback(() => {
    void del(`/grid-preferences/${gridName}`)
      .then(() => {
        hasOwnLayout.current = false;
        apiRef.current?.resetColumnState();
        apiRef.current?.sizeColumnsToFit();
        setDirty(false);
        toast.success(t('grid.layoutReset'));
      })
      .catch(() => toast.error(t('common.errorTitle')));
  }, [gridName, t, toast]);

  // Re-key the grid when direction, text size or contrast changes: AG Grid
  // measures rows once, so an in-place change leaves stale row heights.
  const gridKey = `${gridName}-${i18n.language}-${fontSize}-${contrast}-${ready}`;

  return (
    <div className="gridarea">
      <div
        className="ag-theme-quartz ag-theme-kortex"
        style={{ height: height ?? undefined, flex: height ? undefined : 1, width: '100%' }}
      >
        <AgGridReact<T>
          key={gridKey}
          /* legacy = use the imported CSS themes, not the v34 Theming API */
          theme="legacy"
          rowData={rows}
          columnDefs={configured}
          defaultColDef={defaultColDef}
          loading={loading || !ready}
          animateRows={false}
          headerHeight={undefined}
          getRowId={getRowId ? (params) => getRowId(params.data) : undefined}
          onGridReady={onGridReady}
          onGridSizeChanged={fitColumns}
          onFirstDataRendered={fitColumns}
          onColumnMoved={() => setDirty(true)}
          onColumnResized={(event) => { if (event.finished && event.source !== 'gridInitializing') setDirty(true); }}
          onColumnVisible={() => setDirty(true)}
          onSortChanged={() => setDirty(true)}
          onRowClicked={(event) => { if (event.data && onRowClick) onRowClick(event.data); }}
          overlayNoRowsTemplate={`<span style="color:var(--text-muted);font-size:var(--text-base)">${
            emptyMessage ?? t('grid.noRows')}</span>`}
          enableRtl={i18n.dir() === 'rtl'}
          suppressCellFocus={!!onRowClick}
          rowSelection={undefined}
        />
      </div>

      {allowLayout && (
        <div className="grid-toolbar">
          <span>
            {rows.length} {t('common.of')} {rows.length}
          </span>
          <span style={{ flex: 1 }} />
          {dirty && (
            <Button size="sm" variant="primary" icon={<Save size={14} />} onClick={saveLayout}>
              {t('grid.saveLayout')}
            </Button>
          )}
          <Button size="sm" variant="ghost" icon={<RotateCcw size={14} />} onClick={resetLayout}>
            {t('grid.resetColumns')}
          </Button>
        </div>
      )}
    </div>
  );
}
