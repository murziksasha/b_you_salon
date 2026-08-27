import { describe, expect, it } from 'vitest';
import { buildDayTimeline, isOverdueCallback, snoozeHours, snoozeTomorrow } from './callback-schedule';

describe('callback-schedule', () => {
  it('snoozeHours advances time', () => {
    const base = new Date('2026-03-15T12:00:00.000Z');
    const next = snoozeHours(1, base);
    expect(Date.parse(next)).toBe(base.getTime() + 3600_000);
  });

  it('snoozeTomorrow sets local morning', () => {
    const base = new Date(2026, 2, 15, 15, 30, 0);
    const next = new Date(snoozeTomorrow(10, 0, base));
    expect(next.getDate()).toBe(16);
    expect(next.getHours()).toBe(10);
    expect(next.getMinutes()).toBe(0);
  });

  it('isOverdueCallback', () => {
    const past = new Date(Date.now() - 60_000).toISOString();
    const future = new Date(Date.now() + 60_000).toISOString();
    expect(isOverdueCallback(past)).toBe(true);
    expect(isOverdueCallback(future)).toBe(false);
  });

  it('buildDayTimeline groups by hour', () => {
    const day = new Date(2026, 2, 15, 12, 0, 0);
    const at10 = new Date(2026, 2, 15, 10, 15, 0).toISOString();
    const at14 = new Date(2026, 2, 15, 14, 0, 0).toISOString();
    const { slots } = buildDayTimeline(
      [
        { id: '1', kind: 'lead', phone: '+380', callbackAt: at10, open: true },
        { id: '2', kind: 'order', phone: '+381', callbackAt: at14, open: true, productTitle: 'X' },
      ],
      day,
    );
    const s10 = slots.find((s) => s.hour === 10);
    const s14 = slots.find((s) => s.hour === 14);
    expect(s10?.items.map((i) => i.id)).toEqual(['1']);
    expect(s14?.items.map((i) => i.id)).toEqual(['2']);
  });
});
