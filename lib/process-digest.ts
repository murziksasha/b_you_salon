import type { Lead } from './leads';
import type { Order } from './orders';
import { mergeInbox, upcomingCallbacks } from './inbox';
import { normalizeStatus } from './workflow';
import { isOverdueCallback } from './callback-schedule';
import { computeProcessMetrics, formatDurationSec } from './process-metrics';

export function buildMorningDigest(leads: Lead[], orders: Order[]): string {
  const inbox = mergeInbox(leads, orders);
  const open = inbox.filter((i) => i.open);
  const stale = open.filter((i) => i.stale);
  const very = open.filter((i) => i.veryStale);
  const callbacks = upcomingCallbacks(inbox, 20);
  const overdueCb = callbacks.filter((c) => isOverdueCallback(c.callbackAt));
  const unassigned = open.filter((i) => !i.assignee);
  const metrics = computeProcessMetrics(leads, orders);

  return [
    '☀️ Ранковий огляд B_You',
    `Відкрито: ${open.length} (ліди ${open.filter((i) => i.kind === 'lead').length}, замовлення ${open.filter((i) => i.kind === 'order').length})`,
    `SLA: ${stale.length} >1год · ${very.length} >24год`,
    `Передзвінки: ${callbacks.length} (прострочено ${overdueCb.length})`,
    `Без відповідального: ${unassigned.length}`,
    `Медіана first-touch: ${formatDurationSec(metrics.medianTimeToFirstTouchSec)}`,
    `Час: ${new Date().toLocaleString('uk-UA')}`,
  ].join('\n');
}

export function buildEveningDigest(leads: Lead[], orders: Order[]): string {
  const inbox = mergeInbox(leads, orders);
  const open = inbox.filter((i) => i.open);
  const callbacks = upcomingCallbacks(inbox, 30);
  const tomorrow = callbacks.filter((c) => {
    if (!c.callbackAt) return false;
    const d = new Date(c.callbackAt);
    const now = new Date();
    const tmr = new Date(now);
    tmr.setDate(tmr.getDate() + 1);
    return d.toDateString() === tmr.toDateString() || d.toDateString() === now.toDateString();
  });
  const metrics = computeProcessMetrics(leads, orders);
  const doneToday = [...leads, ...orders].filter((x) => {
    const s = normalizeStatus(x.status, x.handled);
    if (s !== 'done' && s !== 'spam') return false;
    const at = x.handledAt || '';
    return at.slice(0, 10) === new Date().toISOString().slice(0, 10);
  });

  return [
    '🌙 Вечірній handoff B_You',
    `Ще відкрито: ${open.length}`,
    `Закрито сьогодні: ${doneToday.length}`,
    `Передзвінки сьогодні/завтра: ${tomorrow.length}`,
    `Outcome coverage: ${metrics.outcomeCoverage != null ? Math.round(metrics.outcomeCoverage * 100) + '%' : '—'}`,
    `Медіана first-touch: ${formatDurationSec(metrics.medianTimeToFirstTouchSec)}`,
    `Час: ${new Date().toLocaleString('uk-UA')}`,
  ].join('\n');
}

export function buildSlaReminder(leads: Lead[], orders: Order[]): string | null {
  const inbox = mergeInbox(leads, orders);
  const open = inbox.filter((i) => i.open);
  const staleNew = open.filter((i) => i.status === 'new' && i.stale);
  const very = open.filter((i) => i.veryStale);
  if (!staleNew.length && !very.length) return null;
  return [
    '⏰ SLA нагадування',
    staleNew.length ? `Нові без реакції >1 год: ${staleNew.length}` : '',
    very.length ? `Відкриті >24 год: ${very.length}` : '',
    `Час: ${new Date().toLocaleString('uk-UA')}`,
  ]
    .filter(Boolean)
    .join('\n');
}
