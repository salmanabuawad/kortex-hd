/** Formatting helpers. Hebrew locale, and everything numeric is rendered so it
 *  stays left-to-right inside the right-to-left page. */

const LOCALE = 'he-IL';

export function formatDate(value: string | null | undefined): string {
  if (!value) return '—';
  return new Date(value).toLocaleDateString(LOCALE, {
    day: '2-digit', month: '2-digit', year: 'numeric',
  });
}

export function formatDateTime(value: string | null | undefined): string {
  if (!value) return '—';
  return new Date(value).toLocaleString(LOCALE, {
    day: '2-digit', month: '2-digit', year: 'numeric',
    hour: '2-digit', minute: '2-digit',
  });
}

export function formatTime(value: string | null | undefined): string {
  if (!value) return '—';
  return new Date(value).toLocaleTimeString(LOCALE, { hour: '2-digit', minute: '2-digit' });
}

/** "לפני 3 שעות" -- relative time reads better than a timestamp in a feed. */
export function relativeTime(value: string | null | undefined): string {
  if (!value) return '—';
  const then = new Date(value).getTime();
  const diffSeconds = Math.round((then - Date.now()) / 1000);
  const abs = Math.abs(diffSeconds);

  const formatter = new Intl.RelativeTimeFormat(LOCALE, { numeric: 'auto' });
  if (abs < 60) return formatter.format(Math.round(diffSeconds), 'second');
  if (abs < 3600) return formatter.format(Math.round(diffSeconds / 60), 'minute');
  if (abs < 86400) return formatter.format(Math.round(diffSeconds / 3600), 'hour');
  if (abs < 2592000) return formatter.format(Math.round(diffSeconds / 86400), 'day');
  if (abs < 31536000) return formatter.format(Math.round(diffSeconds / 2592000), 'month');
  return formatter.format(Math.round(diffSeconds / 31536000), 'year');
}

export function formatCurrency(value: number | null | undefined): string {
  if (value === null || value === undefined) return '—';
  return new Intl.NumberFormat(LOCALE, {
    style: 'currency', currency: 'ILS', maximumFractionDigits: 0,
  }).format(value);
}

export function formatNumber(value: number | null | undefined): string {
  if (value === null || value === undefined) return '—';
  return new Intl.NumberFormat(LOCALE).format(value);
}

export function formatHours(value: number | null | undefined): string {
  if (value === null || value === undefined) return '—';
  return `${new Intl.NumberFormat(LOCALE).format(value)} שע׳`;
}

export function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

/** SLA countdown, phrased for whichever side of the deadline we are on. */
export function formatSlaRemaining(minutes: number | null | undefined): string {
  if (minutes === null || minutes === undefined) return 'ללא יעד';
  const abs = Math.abs(minutes);
  const days = Math.floor(abs / 1440);
  const hours = Math.floor((abs % 1440) / 60);
  const mins = abs % 60;

  let span: string;
  if (days > 0) span = `${days} ימים${hours ? ` ו-${hours} שעות` : ''}`;
  else if (hours > 0) span = `${hours} שעות${mins ? ` ו-${mins} דק׳` : ''}`;
  else span = `${mins} דקות`;

  return minutes < 0 ? `באיחור של ${span}` : `נותרו ${span}`;
}

export function initialsOf(name: string | null | undefined): string {
  if (!name) return '—';
  const parts = name.trim().split(/\s+/).filter(Boolean);
  return parts.slice(0, 2).map((p) => p[0]).join('') || name.slice(0, 2);
}

/** Parse the JSON blob stored on an audit event without throwing on old rows. */
export function parseDetails(details: string | null | undefined): Record<string, unknown> | null {
  if (!details) return null;
  try {
    const parsed = JSON.parse(details);
    return typeof parsed === 'object' && parsed !== null ? parsed : { value: parsed };
  } catch {
    return { value: details };
  }
}
