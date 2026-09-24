/** Small, dependency-free date helpers shared by the session / study-pod scheduling forms. */

const DATE_RE = /^(\d{4})-(\d{2})-(\d{2})$/;
const TIME_RE = /^([01]?\d|2[0-3]):([0-5]\d)$/;

function pad2(n: number): string {
  return n < 10 ? `0${n}` : `${n}`;
}

/** yyyy-mm-dd in the device's local time. */
export function toDateInput(d: Date): string {
  return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;
}

/** Local date + "HH:MM" -> Date, or null when either part is malformed or the date does not exist (e.g. 2026-02-31). */
export function parseLocalDateTime(dateText: string, timeText: string): Date | null {
  const d = DATE_RE.exec(dateText.trim());
  const t = TIME_RE.exec(timeText.trim());
  if (!d || !t) return null;
  const year = Number(d[1]);
  const month = Number(d[2]);
  const day = Number(d[3]);
  const date = new Date(year, month - 1, day, Number(t[1]), Number(t[2]), 0, 0);
  if (date.getFullYear() !== year || date.getMonth() !== month - 1 || date.getDate() !== day) return null;
  return date;
}

export function addDays(base: Date, days: number): Date {
  const d = new Date(base);
  d.setDate(d.getDate() + days);
  return d;
}

/** The coming Saturday (or the one after, when today already is Saturday). */
export function nextSaturday(from: Date = new Date()): Date {
  const daysUntil = (6 - from.getDay() + 7) % 7 || 7;
  return addDays(from, daysUntil);
}

/** "Fri 26 Sep, 3:00 PM" - short, locale-aware. */
export function formatWhen(iso: string, locale?: string): string {
  const d = new Date(iso);
  if (isNaN(d.getTime())) return '';
  const day = d.toLocaleDateString(locale, { weekday: 'short', day: 'numeric', month: 'short' });
  const time = d.toLocaleTimeString(locale, { hour: 'numeric', minute: '2-digit' });
  return `${day}, ${time}`;
}

/** "in 2 hours", "tomorrow", "3 days ago" - coarse and friendly. */
export function relativeTime(iso: string, now: number = Date.now()): string {
  const diff = new Date(iso).getTime() - now;
  if (isNaN(diff)) return '';
  const abs = Math.abs(diff);
  const minutes = Math.round(abs / 60000);
  const hours = Math.round(abs / 3600000);
  const days = Math.round(abs / 86400000);
  let text: string;
  if (minutes < 1) return 'now';
  if (minutes < 60) text = `${minutes} min`;
  else if (hours < 24) text = `${hours} hour${hours === 1 ? '' : 's'}`;
  else if (days === 1) return diff > 0 ? 'tomorrow' : 'yesterday';
  else if (days < 60) text = `${days} days`;
  else text = `${Math.round(days / 30)} months`;
  return diff > 0 ? `in ${text}` : `${text} ago`;
}

export function endTimeOf(iso: string, durationMinutes: number): string {
  return new Date(new Date(iso).getTime() + durationMinutes * 60000).toISOString();
}
