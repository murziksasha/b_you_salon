import { describe, expect, it } from 'vitest';
import { dateKeyInTimeZone, hourInTimeZone, isQuietHours, kyivClock } from './quiet-hours';

describe('quiet-hours', () => {
  it('overnight 22–8 in Europe/Kyiv', () => {
    const opts = { start: 22, end: 8, timeZone: 'Europe/Kyiv' };
    // 2026-01-01 23:00 Kyiv = 21:00 UTC (EET)
    expect(isQuietHours({ ...opts, now: new Date('2026-01-01T21:00:00.000Z') })).toBe(true);
    // 07:00 Kyiv = 05:00 UTC
    expect(isQuietHours({ ...opts, now: new Date('2026-01-01T05:00:00.000Z') })).toBe(true);
    // 12:00 Kyiv = 10:00 UTC
    expect(isQuietHours({ ...opts, now: new Date('2026-01-01T10:00:00.000Z') })).toBe(false);
    // 22:00 Kyiv = 20:00 UTC
    expect(isQuietHours({ ...opts, now: new Date('2026-01-01T20:00:00.000Z') })).toBe(true);
    // 08:00 Kyiv = 06:00 UTC — quiet ends
    expect(isQuietHours({ ...opts, now: new Date('2026-01-01T06:00:00.000Z') })).toBe(false);
  });

  it('same-day window and start===end off', () => {
    const now = new Date('2026-01-01T10:00:00.000Z'); // 12:00 Kyiv
    expect(isQuietHours({ start: 1, end: 5, now, timeZone: 'Europe/Kyiv' })).toBe(false);
    expect(isQuietHours({ start: 10, end: 14, now, timeZone: 'Europe/Kyiv' })).toBe(true);
    expect(isQuietHours({ start: 8, end: 8, now, timeZone: 'Europe/Kyiv' })).toBe(false);
  });

  it('uses local hours when no timeZone is passed', () => {
    const local = new Date(2026, 0, 1, 23, 0, 0);
    expect(isQuietHours({ start: 22, end: 8, now: local })).toBe(true);
    expect(isQuietHours({ start: 22, end: 8, now: new Date(2026, 0, 1, 12, 0, 0) })).toBe(false);
  });

  it('kyiv clock parts', () => {
    expect(hourInTimeZone(new Date('2026-01-01T21:00:00.000Z'), 'Europe/Kyiv')).toBe(23);
    expect(dateKeyInTimeZone(new Date('2026-01-01T21:00:00.000Z'), 'Europe/Kyiv')).toBe('2026-01-01');
    expect(kyivClock(new Date('2026-01-01T22:30:00.000Z')).dateKey).toBe('2026-01-02');
  });
});
