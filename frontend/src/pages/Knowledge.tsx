import { useState } from 'react';
import { BookOpen, Lightbulb, Plus, Search } from 'lucide-react';

import { get, post } from '../lib/api';
import { useAuth } from '../lib/auth';
import { useAction, useAsync } from '../lib/hooks';
import type { Category, KnownIssue } from '../lib/types';
import {
  Banner, Button, Card, Chip, Dialog, EmptyState, ErrorState, PageHeader, SelectField,
  SkeletonRows, TextAreaField, TextField,
} from '../components/ui';
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

  return (
    <>
      <PageHeader
        title="פתרונות ותקלות ידועות"
        subtitle="מאגר פתרונות שמוצג לפונים בעת פתיחת קריאה בקטגוריה המתאימה"
        actions={user?.role === 'admin' ? (
          <Button variant="primary" icon={<Plus size={16} />} onClick={() => setCreating(true)}>
            פתרון חדש
          </Button>
        ) : undefined}
      />

      <div className="toolbar">
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
      </div>

      {issues.error ? (
        <ErrorState message={issues.error} onRetry={issues.reload} />
      ) : issues.loading ? (
        <SkeletonRows rows={4} />
      ) : visible.length === 0 ? (
        <Card>
          <div className="card__body">
            <EmptyState
              icon={<BookOpen />}
              title={term ? 'לא נמצאו פתרונות' : 'אין עדיין פתרונות במאגר'}
              text="פתרון שנוסף כאן מוצג אוטומטית לפונה בעת פתיחת קריאה באותה קטגוריה."
            />
          </div>
        </Card>
      ) : (
        <div className="grid grid--2">
          {visible.map((issue) => (
            <Card key={issue.id}>
              <div className="cat-card">
                <span className="cat-card__icon cat-card__icon--amber">
                  <Lightbulb size={20} />
                </span>
                <div className="grow">
                  <div className="row row--wrap" style={{ gap: 'var(--space-2)' }}>
                    <h3 style={{ fontSize: 'var(--text-md)' }}>{issue.title}</h3>
                    {issue.category && <Chip tone="blue">{issue.category}</Chip>}
                  </div>
                  <p style={{ marginTop: 'var(--space-2)' }}>{issue.summary}</p>
                  {issue.resolution && (
                    <div className="cat-card__rules">
                      <strong>פתרון</strong>
                      <span>{issue.resolution}</span>
                    </div>
                  )}
                </div>
              </div>
            </Card>
          ))}
        </div>
      )}

      <KnownIssueDialog
        open={creating} onClose={() => setCreating(false)}
        categories={categories.data?.items ?? []}
        onSaved={() => { issues.reload(); setCreating(false); toast.success('הפתרון נוסף'); }}
      />
    </>
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
