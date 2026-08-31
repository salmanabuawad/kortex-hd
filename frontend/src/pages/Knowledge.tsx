import { useMemo, useState } from 'react';
import type { ColDef, ICellRendererParams } from 'ag-grid-community';
import { BookOpen, Plus, Search } from 'lucide-react';

import { get, post } from '../lib/api';
import { useAuth } from '../lib/auth';
import { useAction, useAsync } from '../lib/hooks';
import type { Category, KnownIssue } from '../lib/types';
import {
  Banner, Button, Dialog, ErrorState, SelectField,
  TextAreaField, TextField,
} from '../components/ui';
import { PageFrame } from '../components/layout/Shell';
import { DataGrid } from '../components/grid/DataGrid';
import { useToast } from '../components/ui/toast';

export default function Knowledge() {
  const { user } = useAuth();
  const toast = useToast();
  const [search, setSearch] = useState('');
  const [categoryId, setCategoryId] = useState('');
  const [creating, setCreating] = useState(false);

  const issues = useAsync<{ items: KnownIssue[] }>(
    () => get<{ items: KnownIssue[] }>(
      categoryId ? `/known-issues?category_id=${categoryId}` : '/known-issues'),
    [categoryId]);
  const categories = useAsync<{ items: Category[] }>(
    () => get<{ items: Category[] }>('/categories'), []);

  const term = search.trim().toLowerCase();
  const visible = (issues.data?.items ?? []).filter((issue) =>
    !term
    || issue.title.toLowerCase().includes(term)
    || issue.summary.toLowerCase().includes(term));

  const columns = useMemo<ColDef<KnownIssue>[]>(() => [
    {
      colId: 'title', field: 'title', headerName: 'נושא', flex: 1.4, minWidth: 220,
      cellRenderer: (p: ICellRendererParams<KnownIssue>) =>
        <span className="grid-subject">{p.value}</span>,
    },
    {
      colId: 'category', field: 'category', headerName: 'קטגוריה', width: 180,
      valueGetter: (p) => p.data?.category ?? 'ללא שיוך',
    },
    {
      colId: 'summary', field: 'summary', headerName: 'מה לבדוק', flex: 2, minWidth: 240,
      cellRenderer: (p: ICellRendererParams<KnownIssue>) =>
        <span className="cell-meta">{p.value}</span>,
    },
    {
      colId: 'resolution', field: 'resolution', headerName: 'פתרון', flex: 1.5, minWidth: 200,
      valueGetter: (p) => p.data?.resolution ?? '—',
    },
  ], []);

  return (
    <PageFrame
      icon={<BookOpen />}
      title="פתרונות ותקלות ידועות"
      summary="מאגר פתרונות שמוצג לפונים בעת פתיחת קריאה בקטגוריה המתאימה"
      actions={user?.role === 'admin' ? (
        <Button variant="primary" icon={<Plus size={16} />} onClick={() => setCreating(true)}>
          פתרון חדש
        </Button>
      ) : undefined}
      filters={
        <>
          <div className="toolbar__search">
            <Search aria-hidden />
            <input
              type="search" value={search} aria-label="חיפוש פתרונות"
              placeholder="חיפוש לפי נושא או תוכן…"
              onChange={(event) => setSearch(event.target.value)}
            />
          </div>
          <select className="select" value={categoryId} aria-label="סינון לפי קטגוריה"
                  onChange={(event) => setCategoryId(event.target.value)}>
            <option value="">כל הקטגוריות</option>
            {categories.data?.items.map((category) => (
              <option key={category.id} value={category.id}>{category.name}</option>
            ))}
          </select>
        </>
      }
    >

      {issues.error ? (
        <ErrorState message={issues.error} onRetry={issues.reload} />
      ) : (
        <DataGrid<KnownIssue>
          gridName="knowledge"
          rows={visible}
          columns={columns}
          loading={issues.loading}
          getRowId={(row) => String(row.id)}
          allowLayout={false}
          emptyMessage={term ? 'לא נמצאו פתרונות' : 'אין עדיין פתרונות במאגר'}
        />
      )}

      <KnownIssueDialog
        open={creating} onClose={() => setCreating(false)}
        categories={categories.data?.items ?? []}
        onSaved={() => { issues.reload(); setCreating(false); toast.success('הפתרון נוסף'); }}
      />
    </PageFrame>
  );
}

function KnownIssueDialog({
  open, onClose, categories, onSaved,
}: { open: boolean; onClose: () => void; categories: Category[]; onSaved: () => void }) {
  const { busy, run } = useAction();
  const [title, setTitle] = useState('');
  const [summary, setSummary] = useState('');
  const [resolution, setResolution] = useState('');
  const [categoryId, setCategoryId] = useState('');
  const [error, setError] = useState('');

  const submit = (event: React.FormEvent) => {
    event.preventDefault();
    if (title.trim().length < 2) { setError('יש להזין כותרת'); return; }
    if (!summary.trim()) { setError('יש להזין תיאור'); return; }
    setError('');
    void run(
      () => post('/known-issues', {
        title: title.trim(),
        summary: summary.trim(),
        resolution: resolution.trim() || null,
        category_id: categoryId ? Number(categoryId) : null,
        active: true,
      }),
      {
        onSuccess: () => {
          setTitle(''); setSummary(''); setResolution(''); setCategoryId('');
          onSaved();
        },
        onError: setError,
      },
    );
  };

  return (
    <Dialog
      open={open} onClose={onClose} title="פתרון חדש"
      footer={
        <>
          <Button variant="primary" loading={busy} type="submit" form="issue-form">שמירה</Button>
          <Button variant="ghost" onClick={onClose}>ביטול</Button>
        </>
      }
    >
      <form id="issue-form" className="stack" onSubmit={submit}>
        {error && <Banner tone="danger">{error}</Banner>}
        <TextField
          label="כותרת" required value={title}
          placeholder="למשל: אין חיבור לאינטרנט במשרד"
          onChange={(event) => setTitle(event.target.value)}
        />
        <SelectField
          label="קטגוריה" value={categoryId}
          hint="הפתרון יוצג לפונה בעת בחירת קטגוריה זו"
          onChange={(event) => setCategoryId(event.target.value)}
        >
          <option value="">ללא שיוך</option>
          {categories.map((category) => (
            <option key={category.id} value={category.id}>{category.name}</option>
          ))}
        </SelectField>
        <TextAreaField
          label="מה לבדוק לפני פתיחת קריאה" required value={summary}
          onChange={(event) => setSummary(event.target.value)}
        />
        <TextAreaField
          label="הפתרון המלא" value={resolution}
          onChange={(event) => setResolution(event.target.value)}
        />
      </form>
    </Dialog>
  );
}
