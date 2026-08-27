export type TimeFilter = 'all' | 'today' | 'week';

export function matchesTimeFilter(iso: string, filter: TimeFilter, now = new Date()): boolean {
  if (filter === 'all') return true;
  const t = new Date(iso).getTime();
  if (!Number.isFinite(t)) return false;
  const start = new Date(now);
  start.setHours(0, 0, 0, 0);
  if (filter === 'today') return t >= start.getTime();
  // week: last 7 days including today
  const weekStart = new Date(start);
  weekStart.setDate(weekStart.getDate() - 6);
  return t >= weekStart.getTime();
}

export function matchesPhoneQuery(phone: string, query: string): boolean {
  const q = query.replace(/\D/g, '');
  if (!q) return true;
  return phone.replace(/\D/g, '').includes(q);
}
