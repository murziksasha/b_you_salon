import type { Lead } from './leads';
import type { Order } from './orders';
import { normalizeStatus } from './workflow';

export interface RetentionPolicy {
  leadRetentionMonths: number;
  orderRetentionDays: number;
  ordersPurgeEnabled: boolean;
}

export const DEFAULT_RETENTION_POLICY: RetentionPolicy = {
  leadRetentionMonths: 12,
  orderRetentionDays: 1095, // 3 years (TCU Art. 44.3)
  ordersPurgeEnabled: false, // Statutory tax record hold
};

/**
 * Calculates a date by subtracting calendar months, handling leap years and variable month lengths.
 */
export function subtractCalendarMonths(referenceDate: Date, months: number): Date {
  const year = referenceDate.getUTCFullYear();
  const month = referenceDate.getUTCMonth();
  const day = referenceDate.getUTCDate();
  const hours = referenceDate.getUTCHours();
  const minutes = referenceDate.getUTCMinutes();
  const seconds = referenceDate.getUTCSeconds();
  const ms = referenceDate.getUTCMilliseconds();

  const targetDate = new Date(Date.UTC(year, month - months, 1, hours, minutes, seconds, ms));
  const daysInTargetMonth = new Date(Date.UTC(targetDate.getUTCFullYear(), targetDate.getUTCMonth() + 1, 0)).getUTCDate();
  targetDate.setUTCDate(Math.min(day, daysInTargetMonth));

  return targetDate;
}

export interface LeadPurgeEvaluation {
  purgeable: boolean;
  reason: 'active_status' | 'no_answer' | 'missing_handled_at' | 'legal_hold' | 'within_retention' | 'expired';
}

export function evaluateLeadRetention(
  lead: Lead & { legalHold?: boolean },
  referenceDate: Date = new Date(),
  policy: RetentionPolicy = DEFAULT_RETENTION_POLICY,
): LeadPurgeEvaluation {
  if (lead.legalHold) {
    return { purgeable: false, reason: 'legal_hold' };
  }

  const status = normalizeStatus(lead.status, lead.handled);
  if (status === 'no_answer') {
    return { purgeable: false, reason: 'no_answer' };
  }

  const isClosed = status === 'done' || status === 'spam';
  if (!isClosed) {
    return { purgeable: false, reason: 'active_status' };
  }

  const dateStr = lead.handledAt || (status === 'spam' ? lead.createdAt : undefined);
  if (!dateStr) {
    return { purgeable: false, reason: 'missing_handled_at' };
  }

  const itemTime = new Date(dateStr).getTime();
  if (isNaN(itemTime)) {
    return { purgeable: false, reason: 'missing_handled_at' };
  }

  const cutoff = subtractCalendarMonths(referenceDate, policy.leadRetentionMonths).getTime();
  if (itemTime < cutoff) {
    return { purgeable: true, reason: 'expired' };
  }

  return { purgeable: false, reason: 'within_retention' };
}

export interface OrderPurgeEvaluation {
  purgeable: boolean;
  reason: 'statutory_tax_hold' | 'active_status' | 'missing_handled_at' | 'legal_hold' | 'within_retention' | 'expired';
}

export function evaluateOrderRetention(
  order: Order & { legalHold?: boolean },
  referenceDate: Date = new Date(),
  policy: RetentionPolicy = DEFAULT_RETENTION_POLICY,
): OrderPurgeEvaluation {
  if (!policy.ordersPurgeEnabled) {
    return { purgeable: false, reason: 'statutory_tax_hold' };
  }

  if (order.legalHold) {
    return { purgeable: false, reason: 'legal_hold' };
  }

  const status = normalizeStatus(order.status, order.handled);
  const isClosed = status === 'done' || status === 'spam';
  if (!isClosed) {
    return { purgeable: false, reason: 'active_status' };
  }

  if (!order.handledAt) {
    return { purgeable: false, reason: 'missing_handled_at' };
  }

  const handledTime = new Date(order.handledAt).getTime();
  if (isNaN(handledTime)) {
    return { purgeable: false, reason: 'missing_handled_at' };
  }

  const cutoff = referenceDate.getTime() - policy.orderRetentionDays * 24 * 60 * 60 * 1000;
  if (handledTime < cutoff) {
    return { purgeable: true, reason: 'expired' };
  }

  return { purgeable: false, reason: 'within_retention' };
}

