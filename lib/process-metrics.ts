import type { Lead } from './leads';
import type { Order } from './orders';
import { normalizeStatus } from './workflow';

export type ProcessMetrics = {
  sampleLeads: number;
  sampleOrders: number;
  /** Median seconds from created → first non-created audit (status/assign/handled) */
  medianTimeToFirstTouchSec: number | null;
  avgTimeToFirstTouchSec: number | null;
  /** Share of closed with outcome set */
  outcomeCoverage: number | null;
  /** Share closed as spam */
  spamRate: number | null;
  noAnswerRate: number | null;
  /** Open unassigned */
  unassignedOpen: number;
  inProgress: number;
};

function firstTouchMs(createdAt: string, audit?: Array<{ at: string; action: string }>): number | null {
  if (!audit?.length) return null;
  const created = Date.parse(createdAt);
  if (!Number.isFinite(created)) return null;
  const touch = audit.find(
    (a) => a.action === 'status' || a.action === 'assign' || a.action === 'handled' || a.action === 'note',
  );
  // Prefer first status after created
  const after = audit
    .filter((a) => a.action !== 'created')
    .map((a) => Date.parse(a.at))
    .filter((t) => Number.isFinite(t) && t >= created)
    .sort((a, b) => a - b);
  if (!after.length && !touch) return null;
  const t = after[0] ?? Date.parse(touch!.at);
  if (!Number.isFinite(t)) return null;
  return Math.max(0, t - created);
}

function median(nums: number[]): number | null {
  if (!nums.length) return null;
  const s = [...nums].sort((a, b) => a - b);
  const mid = Math.floor(s.length / 2);
  return s.length % 2 ? s[mid] : (s[mid - 1] + s[mid]) / 2;
}

export function computeProcessMetrics(leads: Lead[], orders: Order[]): ProcessMetrics {
  const touches: number[] = [];
  for (const l of leads) {
    const ms = firstTouchMs(l.createdAt, l.audit);
    if (ms != null) touches.push(ms / 1000);
  }
  for (const o of orders) {
    const ms = firstTouchMs(o.createdAt, o.audit);
    if (ms != null) touches.push(ms / 1000);
  }

  const closedLeads = leads.filter((l) => {
    const s = normalizeStatus(l.status, l.handled);
    return s === 'done' || s === 'spam' || s === 'no_answer';
  });
  const closedOrders = orders.filter((o) => {
    const s = normalizeStatus(o.status, o.handled);
    return s === 'done' || s === 'spam' || s === 'no_answer';
  });
  const closed = [...closedLeads, ...closedOrders];
  const withOutcome = closed.filter((x) => Boolean((x as Lead).outcome));

  const all = [
    ...leads.map((l) => ({ ...l, kind: 'lead' as const })),
    ...orders.map((o) => ({ ...o, kind: 'order' as const })),
  ];
  let unassignedOpen = 0;
  let inProgress = 0;
  let spam = 0;
  let noAnswer = 0;
  for (const x of all) {
    const s = normalizeStatus(x.status, x.handled);
    if (s === 'spam') spam++;
    if (s === 'no_answer') noAnswer++;
    if (s === 'in_progress') inProgress++;
    const open =
      s === 'new' || s === 'called' || s === 'waiting' || s === 'in_progress' || s === 'no_answer';
    if (open && !x.assignee) unassignedOpen++;
  }

  const totalClosed = closed.length;
  return {
    sampleLeads: leads.length,
    sampleOrders: orders.length,
    medianTimeToFirstTouchSec: median(touches),
    avgTimeToFirstTouchSec: touches.length
      ? touches.reduce((a, b) => a + b, 0) / touches.length
      : null,
    outcomeCoverage: totalClosed ? withOutcome.length / totalClosed : null,
    spamRate: all.length ? spam / all.length : null,
    noAnswerRate: all.length ? noAnswer / all.length : null,
    unassignedOpen,
    inProgress,
  };
}

export function formatDurationSec(sec: number | null): string {
  if (sec == null || !Number.isFinite(sec)) return '—';
  if (sec < 60) return `${Math.round(sec)} с`;
  if (sec < 3600) return `${Math.round(sec / 60)} хв`;
  const h = Math.floor(sec / 3600);
  const m = Math.round((sec % 3600) / 60);
  return `${h} год ${m} хв`;
}
