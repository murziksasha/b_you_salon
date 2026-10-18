import { describe, expect, it } from 'vitest';
import {
  morningHour,
  shouldCatchup,
  shouldSendEveningDigest,
  shouldSendMorningDigest,
  TELEGRAM_CATCHUP_GAP_MS,
} from './telegram-digest';
import type { TelegramBotSettings } from './telegram-store';

const base: TelegramBotSettings = {
  quietStart: 22,
  quietEnd: 8,
  timezone: 'Europe/Kyiv',
};

describe('telegram-digest schedule', () => {
  it('morning fires from quietEnd and once per Kyiv date', () => {
    expect(morningHour(base)).toBe(8);
    // 07:00 Kyiv = 05:00 UTC in January
    expect(shouldSendMorningDigest(new Date('2026-01-01T05:00:00.000Z'), base)).toBe(false);
    // 08:00 Kyiv
    expect(shouldSendMorningDigest(new Date('2026-01-01T06:00:00.000Z'), base)).toBe(true);
    expect(
      shouldSendMorningDigest(new Date('2026-01-01T06:00:00.000Z'), { ...base, lastMorningDigestOn: '2026-01-01' }),
    ).toBe(false);
  });

  it('evening fires from 18:00 Kyiv', () => {
    // 17:00 Kyiv = 15:00 UTC
    expect(shouldSendEveningDigest(new Date('2026-01-01T15:00:00.000Z'), base)).toBe(false);
    // 18:00 Kyiv = 16:00 UTC
    expect(shouldSendEveningDigest(new Date('2026-01-01T16:00:00.000Z'), base)).toBe(true);
  });

  it('catch-up after 15 minutes of silence, not on first run', () => {
    const now = new Date('2026-01-01T10:00:00.000Z');
    expect(shouldCatchup(now, undefined)).toBe(false);
    expect(shouldCatchup(now, now.toISOString())).toBe(false);
    expect(shouldCatchup(now, new Date(now.getTime() - TELEGRAM_CATCHUP_GAP_MS - 1000).toISOString())).toBe(true);
  });
});
