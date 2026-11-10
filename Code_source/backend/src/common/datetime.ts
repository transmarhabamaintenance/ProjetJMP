/**
 * Utilitaires de dates « naïves » (sans fuseau).
 * Formats internes : date = YYYY-MM-DD, datetime = YYYY-MM-DDTHH:mm[:ss].
 */

const pad = (n: number, len = 2): string => String(n).padStart(len, '0');

export function formatDate(d: Date): string {
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

/** Les secondes sont omises quand elles valent 0 (format des API). */
export function formatDateTime(d: Date): string {
  const base = `${formatDate(d)}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
  return d.getSeconds() === 0 ? base : `${base}:${pad(d.getSeconds())}`;
}

export function parseDate(value: string | Date | null | undefined): Date | null {
  if (value == null) return null;
  if (value instanceof Date) return value;
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(value);
  if (!m) return null;
  return new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]), 0, 0, 0, 0);
}

export function parseDateTime(value: string | Date | null | undefined): Date | null {
  if (value == null) return null;
  if (value instanceof Date) return value;
  const m = /^(\d{4})-(\d{2})-(\d{2})[T ](\d{2}):(\d{2})(?::(\d{2}))?/.exec(value);
  if (!m) return null;
  return new Date(
    Number(m[1]), Number(m[2]) - 1, Number(m[3]),
    Number(m[4]), Number(m[5]), m[6] ? Number(m[6]) : 0, 0,
  );
}

export function addMinutes(d: Date, minutes: number): Date {
  return new Date(d.getTime() + minutes * 60_000);
}

export function minutesBetween(from: Date, to: Date): number {
  return Math.floor((to.getTime() - from.getTime()) / 60_000);
}

export function atStartOfDay(d: Date): Date {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate(), 0, 0, 0, 0);
}

export function hoursMinutesOf(d: Date): number {
  return d.getHours() * 60 + d.getMinutes();
}

export function parseHm(time: string): number {
  const m = /^(\d{1,2}):(\d{2})$/.exec(time.trim());
  if (!m) return NaN;
  return Number(m[1]) * 60 + Number(m[2]);
}

export function today(): Date {
  return parseDate(new Date());
}
