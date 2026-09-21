/** Formatting helpers. Dates and numbers follow the active interface language;
 *  everything numeric is rendered so it stays left-to-right inside a
 *  right-to-left page. */
import i18n from '../i18n';

/** Region stays Israel in every language: the calendar, week start and number
 *  grouping a council employee expects do not change when they switch to
 *  Arabic or English. */
/* Arabic defaults to Arabic-Indic digits (٤), but ticket numbers, phone numbers
   and IDs elsewhere in the product are Latin. The -u-nu-latn extension keeps
   every number in the interface using one set of digits. */
const LOCALES: Record<string, string> = {
  he: 'he-IL',
  ar: 'ar-IL-u-nu-latn',
  en: 'en-IL',
};

const locale = () => LOCALES[i18n.language] ?? 'he-IL';

export function formatDate(value: string | null | undefined): string {
  if (!value) return '—';
  return new Date(value).toLocaleDateString(locale(), {
    day: '2-digit', month: '2-digit', year: 'numeric',
  });
}

export function formatDateTime(value: string | null | undefined): string {
  if (!value) return '—';
  return new Date(value).toLocaleString(locale(), {
    day: '2-digit', month: '2-digit', year: 'numeric',
    hour: '2-digit', minute: '2-digit',
  });
}

export function formatTime(value: string | null | undefined): string {
  if (!value) return '—';
  return new Date(value).toLocaleTimeString(locale(), { hour: '2-digit', minute: '2-digit' });
}

/** "לפני 3 שעות" -- relative time reads better than a timestamp in a feed. */
export function relativeTime(value: string | null | undefined): string {
  if (!value) return '—';
  const then = new Date(value).getTime();
  const diffSeconds = Math.round((then - Date.now()) / 1000);
  const abs = Math.abs(diffSeconds);

  const formatter = new Intl.RelativeTimeFormat(locale(), { numeric: 'auto' });
  if (abs < 60) return formatter.format(Math.round(diffSeconds), 'second');
  if (abs < 3600) return formatter.format(Math.round(diffSeconds / 60), 'minute');
  if (abs < 86400) return formatter.format(Math.round(diffSeconds / 3600), 'hour');
  if (abs < 2592000) return formatter.format(Math.round(diffSeconds / 86400), 'day');
  if (abs < 31536000) return formatter.format(Math.round(diffSeconds / 2592000), 'month');
  return formatter.format(Math.round(diffSeconds / 31536000), 'year');
}

export function formatCurrency(value: number | null | undefined): string {
  if (value === null || value === undefined) return '—';
  return new Intl.NumberFormat(locale(), {
    style: 'currency', currency: 'ILS', maximumFractionDigits: 0,
  }).format(value);
}

export function formatNumber(value: number | null | undefined): string {
  if (value === null || value === undefined) return '—';
  return new Intl.NumberFormat(locale()).format(value);
}

export function formatHours(value: number | null | undefined): string {
  if (value === null || value === undefined) return '—';
  const suffix = i18n.t('duration.hoursShort');
  return `${new Intl.NumberFormat(locale()).format(value)} ${
    suffix === 'duration.hoursShort' ? 'שע׳' : suffix}`;
}

/** A response target as a person would say it: שעתיים, יום, 3 ימים, שבוע.
 *  "168 שעות" is technically correct and useless for judging urgency. */
export function formatDuration(hours: number | null | undefined): string {
  if (!hours || hours <= 0) return '';
  if (hours < 24) {
    if (hours === 1) return 'שעה';
    if (hours === 2) return 'שעתיים';
    return `${hours} שעות`;
  }
  if (hours % 168 === 0) {
    const weeks = hours / 168;
    if (weeks === 1) return 'שבוע';
    if (weeks === 2) return 'שבועיים';
    return `${weeks} שבועות`;
  }
  if (hours % 24 === 0) {
    const days = hours / 24;
    if (days === 1) return 'יום';
    if (days === 2) return 'יומיים';
    return `${days} ימים`;
  }
  return `${hours} שעות`;
}

export function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

/** SLA countdown, phrased for whichever side of the deadline we are on. */
export function formatSlaRemaining(minutes: number | null | undefined): string {
  if (minutes === null || minutes === undefined) return i18n.t('sla.none');
  const abs = Math.abs(minutes);
  const days = Math.floor(abs / 1440);
  const hours = Math.floor((abs % 1440) / 60);
  const mins = abs % 60;

  const unit = (key: string, fallback: string) => {
    const value = i18n.t(`duration.${key}`);
    return value === `duration.${key}` ? fallback : value;
  };

  let span: string;
  if (days > 0) span = `${days} ${unit('days', 'ימים')}`;
  else if (hours > 0) span = `${hours} ${unit('hours', 'שעות')}`;
  else span = `${mins} ${unit('minutes', 'דקות')}`;

  return minutes < 0
    ? `${unit('overdueBy', 'באיחור של')} ${span}`
    : `${unit('remaining', 'נותרו')} ${span}`;
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
