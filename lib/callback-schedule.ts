/** Helpers for callbackAt scheduling / snooze / day timeline. */

export function parseCallbackAt(iso?: string | null): number | null {
  if (!iso) return null;
  const t = Date.parse(iso);
  return Number.isFinite(t) ? t : null;
}

export function isOverdueCallback(iso?: string | null, now = Date.now()): boolean {
  const t = parseCallbackAt(iso);
  if (t == null) return false;
  return t < now;
}

/** +hours from now, rounded to minute. */
export function snoozeHours(hours: number, now = new Date()): string {
  const d = new Date(now.getTime() + hours * 60 * 60 * 1000);
  d.setSeconds(0, 0);
  return d.toISOString();
}

/** Tomorrow at local hour:minute (default 10:00). */
export function snoozeTomorrow(hour = 10, minute = 0, now = new Date()): string {
  const d = new Date(now);
  d.setDate(d.getDate() + 1);
  d.setHours(hour, minute, 0, 0);
  return d.toISOString();
}

function pad2(n: number): string {
  return String(n).padStart(2, '0');
}

/** ISO → `YYYY-MM-DDTHH:mm` in local time for `<input type="datetime-local">`. */
export function toDatetimeLocalValue(iso?: string | null): string {
  const t = parseCallbackAt(iso);
  if (t == null) return '';
  const d = new Date(t);
  return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}T${pad2(d.getHours())}:${pad2(d.getMinutes())}`;
}

/** `datetime-local` value → ISO, or null if empty/invalid. */
export function fromDatetimeLocalValue(local?: string | null): string | null {
  const v = (local || '').trim();
  if (!v) return null;
  const m = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})/.exec(v);
  if (!m) return null;
  const d = new Date(
    Number(m[1]),
    Number(m[2]) - 1,
    Number(m[3]),
    Number(m[4]),
    Number(m[5]),
    0,
    0,
  );
  if (!Number.isFinite(d.getTime())) return null;
  return d.toISOString();
}

export type DaySlot = {
  hour: number;
  label: string;
  items: Array<{ id: string; kind: string; phone: string; callbackAt: string; label?: string }>;
};

/** Group open items with callbackAt into hourly slots for a given local day. */
export function buildDayTimeline(
  items: Array<{
    id: string;
    kind: string;
    phone: string;
    callbackAt?: string;
    open?: boolean;
    productTitle?: string;
  }>,
  day: Date = new Date(),
  workStart = 9,
  workEnd = 18,
): { slots: DaySlot[]; overdue: typeof items; outside: typeof items } {
  const start = new Date(day);
  start.setHours(0, 0, 0, 0);
  const end = new Date(day);
  end.setHours(23, 59, 59, 999);
  const startMs = start.getTime();
  const endMs = end.getTime();
  const now = Date.now();

  const slots: DaySlot[] = [];
  for (let h = workStart; h <= workEnd; h++) {
    slots.push({
      hour: h,
      label: `${String(h).padStart(2, '0')}:00`,
      items: [],
    });
  }

  const overdue: typeof items = [];
  const outside: typeof items = [];

  for (const it of items) {
    if (!it.callbackAt) continue;
    if (it.open === false) continue;
    const t = parseCallbackAt(it.callbackAt);
    if (t == null) continue;
    if (t < now && t < startMs) {
      overdue.push(it);
      continue;
    }
    if (t < startMs || t > endMs) {
      outside.push(it);
      continue;
    }
    const hour = new Date(t).getHours();
    const slot = slots.find((s) => s.hour === hour) || slots[slots.length - 1];
    if (hour < workStart || hour > workEnd) {
      outside.push(it);
      continue;
    }
    slot.items.push({
      id: it.id,
      kind: it.kind,
      phone: it.phone,
      callbackAt: it.callbackAt,
      label: it.productTitle,
    });
  }

  // Overdue today (earlier hours)
  for (const it of items) {
    if (!it.callbackAt || it.open === false) continue;
    const t = parseCallbackAt(it.callbackAt);
    if (t == null) continue;
    if (t >= startMs && t < now && t <= endMs) {
      if (!overdue.some((o) => o.id === it.id)) overdue.push(it);
    }
  }

  return { slots, overdue, outside };
}
