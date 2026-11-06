import { describe, expect, it } from 'vitest';
import type { Lead } from './leads';
import type { Order } from './orders';
import {
  DEFAULT_RETENTION_POLICY,
  evaluateLeadRetention,
  evaluateOrderRetention,
  subtractCalendarMonths,
} from './retention';

describe('retention logic', () => {
  describe('subtractCalendarMonths', () => {
    it('handles normal month subtraction', () => {
      const base = new Date('2026-11-04T12:00:00Z');
      const result = subtractCalendarMonths(base, 12);
      expect(result.toISOString().slice(0, 10)).toBe('2025-11-04');
    });

    it('clamps month end correctly (e.g., March 31 minus 1 month in non-leap year)', () => {
      const base = new Date('2025-03-31T12:00:00Z');
      const result = subtractCalendarMonths(base, 1);
      expect(result.toISOString().slice(0, 10)).toBe('2025-02-28');
    });

    it('clamps month end correctly in leap year (March 31 2024 -> Feb 29 2024)', () => {
      const base = new Date('2024-03-31T12:00:00Z');
      const result = subtractCalendarMonths(base, 1);
      expect(result.toISOString().slice(0, 10)).toBe('2024-02-29');
    });

    it('handles leap day minus 12 calendar months (Feb 29 2024 -> Feb 28 2023)', () => {
      const base = new Date('2024-02-29T12:00:00Z');
      const result = subtractCalendarMonths(base, 12);
      expect(result.toISOString().slice(0, 10)).toBe('2023-02-28');
    });
  });

  describe('evaluateLeadRetention', () => {
    const now = new Date('2026-11-04T12:00:00Z');
    const thirteenMonthsAgo = '2025-10-01T10:00:00Z';
    const sixMonthsAgo = '2026-05-01T10:00:00Z';

    it('purges closed leads older than 12 calendar months', () => {
      const lead: Lead = {
        id: 'l1',
        phone: '+380501112233',
        createdAt: thirteenMonthsAgo,
        source: 'callback',
        emailed: true,
        handled: true,
        status: 'done',
        handledAt: thirteenMonthsAgo,
      };
      const evaluation = evaluateLeadRetention(lead, now);
      expect(evaluation.purgeable).toBe(true);
      expect(evaluation.reason).toBe('expired');
    });

    it('retains closed leads within 12 calendar months', () => {
      const lead: Lead = {
        id: 'l2',
        phone: '+380501112233',
        createdAt: sixMonthsAgo,
        source: 'callback',
        emailed: true,
        handled: true,
        status: 'done',
        handledAt: sixMonthsAgo,
      };
      const evaluation = evaluateLeadRetention(lead, now);
      expect(evaluation.purgeable).toBe(false);
      expect(evaluation.reason).toBe('within_retention');
    });

    it('retains active and in-progress leads regardless of age', () => {
      const statuses = ['new', 'called', 'waiting', 'in_progress'] as const;
      for (const status of statuses) {
        const lead: Lead = {
          id: `l-${status}`,
          phone: '+380501112233',
          createdAt: thirteenMonthsAgo,
          source: 'booking',
          emailed: false,
          handled: false,
          status,
        };
        const evaluation = evaluateLeadRetention(lead, now);
        expect(evaluation.purgeable).toBe(false);
        expect(evaluation.reason).toBe('active_status');
      }
    });

    it('retains no_answer leads regardless of age for re-engagement', () => {
      const lead: Lead = {
        id: 'l-no-ans',
        phone: '+380501112233',
        createdAt: thirteenMonthsAgo,
        source: 'callback',
        emailed: true,
        handled: true,
        status: 'no_answer',
        handledAt: thirteenMonthsAgo,
      };
      const evaluation = evaluateLeadRetention(lead, now);
      expect(evaluation.purgeable).toBe(false);
      expect(evaluation.reason).toBe('no_answer');
    });

    it('retains reopened leads regardless of prior handledAt', () => {
      const lead: Lead = {
        id: 'l-reopened',
        phone: '+380501112233',
        createdAt: thirteenMonthsAgo,
        source: 'booking',
        emailed: true,
        handled: false,
        status: 'in_progress',
        handledAt: thirteenMonthsAgo,
      };
      const evaluation = evaluateLeadRetention(lead, now);
      expect(evaluation.purgeable).toBe(false);
      expect(evaluation.reason).toBe('active_status');
    });

    it('retains undated legacy closed leads for manual review', () => {
      const lead: Lead = {
        id: 'l-legacy',
        phone: '+380501112233',
        createdAt: thirteenMonthsAgo,
        source: 'callback',
        emailed: true,
        handled: true,
        status: 'done',
      };
      const evaluation = evaluateLeadRetention(lead, now);
      expect(evaluation.purgeable).toBe(false);
      expect(evaluation.reason).toBe('missing_handled_at');
    });

    it('retains leads under legal hold', () => {
      const lead: Lead & { legalHold?: boolean } = {
        id: 'l-hold',
        phone: '+380501112233',
        createdAt: thirteenMonthsAgo,
        source: 'callback',
        emailed: true,
        handled: true,
        status: 'done',
        handledAt: thirteenMonthsAgo,
        legalHold: true,
      };
      const evaluation = evaluateLeadRetention(lead, now);
      expect(evaluation.purgeable).toBe(false);
      expect(evaluation.reason).toBe('legal_hold');
    });
  });

  describe('evaluateOrderRetention', () => {
    const now = new Date('2026-11-04T12:00:00Z');
    const oldFourYears = '2022-10-01T10:00:00Z';

    const order: Order = {
      id: 'o1',
      phone: '+380501112233',
      createdAt: oldFourYears,
      source: 'shop',
      quantity: 1,
      product: { id: 'p1', title: 'Product 1', price: 100 },
      emailed: true,
      handled: true,
      status: 'done',
      handledAt: oldFourYears,
    };

    it('disallows automatic order purge by default under statutory tax hold', () => {
      const evaluation = evaluateOrderRetention(order, now, DEFAULT_RETENTION_POLICY);
      expect(evaluation.purgeable).toBe(false);
      expect(evaluation.reason).toBe('statutory_tax_hold');
    });

    it('allows purge only if ordersPurgeEnabled is explicitly set and older than 1095 days', () => {
      const policy = { ...DEFAULT_RETENTION_POLICY, ordersPurgeEnabled: true };
      const evaluation = evaluateOrderRetention(order, now, policy);
      expect(evaluation.purgeable).toBe(true);
      expect(evaluation.reason).toBe('expired');
    });

    it('retains orders under legal hold even if purge is enabled', () => {
      const policy = { ...DEFAULT_RETENTION_POLICY, ordersPurgeEnabled: true };
      const evaluation = evaluateOrderRetention({ ...order, legalHold: true }, now, policy);
      expect(evaluation.purgeable).toBe(false);
      expect(evaluation.reason).toBe('legal_hold');
    });
  });
});

