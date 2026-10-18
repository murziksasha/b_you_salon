/** Quiet-hours helpers. Bot uses Europe/Kyiv; browser prefs stay on the local clock. */

export const BOT_TIMEZONE = 'Europe/Kyiv';

export function clampHour(value: unknown, fallback = 0): number {
  const n = typeof value === 'number' ? value : Number.parseInt(String(value ?? ''), 10);
  if (!Number.isFinite(n)) return fallback;
  return Math.min(23, Math.max(0, Math.floor(n)));
}

export function hourInTimeZone(now: Date, timeZone: string): number {
  const parts = new Intl.DateTimeFormat('en-GB', {
    timeZone,
    hour: 'numeric',
    hourCycle: 'h23',
  }).formatToParts(now);
  const h = Number(parts.find((p) => p.type === 'hour')?.value);
  return Number.isFinite(h) ? h : now.getUTCHours();
}

export function dateKeyInTimeZone(now: Date, timeZone: string): string {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(now);
  const y = parts.find((p) => p.type === 'year')?.value;
  const m = parts.find((p) => p.type === 'month')?.value;
  const d = parts.find((p) => p.type === 'day')?.value;
  if (y && m && d) return `${y}-${m}-${d}`;
  return now.toISOString().slice(0, 10);
}

export type QuietHoursInput = {
  start: number;
  end: number;
  now?: Date;
  /** If set, hour is taken in this zone; otherwise `now.getHours()` (local). */
  timeZone?: string;
};

/** True when `now` falls in [start, end) — overnight when start > end. start === end disables. */
export function isQuietHours(input: QuietHoursInput): boolean {
  const start = clampHour(input.start);
  const end = clampHour(input.end);
  if (start === end) return false;
  const now = input.now || new Date();
  const h = input.timeZone ? hourInTimeZone(now, input.timeZone) : now.getHours();
  if (start < end) return h >= start && h < end;
  return h >= start || h < end;
}

export type KyivClock = { hour: number; dateKey: string };

export function kyivClock(now = new Date()): KyivClock {
  return {
    hour: hourInTimeZone(now, BOT_TIMEZONE),
    dateKey: dateKeyInTimeZone(now, BOT_TIMEZONE),
  };
}
