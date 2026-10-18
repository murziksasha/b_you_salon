import { describe, expect, it } from 'vitest';
import {
  type FeedSchedule,
  DEFAULT_FEED_SCHEDULE,
  isScheduleDue,
  applyContinue,
  applyStop,
  kyivDate,
  kyivIsAfter0400,
} from './feed-schedule';

// Europe/Kyiv is UTC+3
const D = (iso: string) => new Date(iso);
// 2026-01-15 04:00 Kyiv = 2026-01-15 01:00 UTC
const AT_0400 = D('2026-01-15T01:00:00.000Z');
// 2026-01-15 03:59 Kyiv = 2026-01-15 00:59 UTC
const BEFORE_0400 = D('2026-01-14T23:59:00.000Z'); // 01:59 UTC+2? Wait, Kyiv in winter is UTC+2
// Actually Europe/Kyiv is UTC+2 in winter (no DST since 2014, stays at UTC+2 year-round)
// 04:00 Kyiv winter = 02:00 UTC
const AT_0400_CORRECT = D('2026-01-15T02:00:00.000Z');
const BEFORE_0400_CORRECT = D('2026-01-15T01:59:00.000Z');
const MIDDAY = D('2026-01-15T10:00:00.000Z'); // 12:00 Kyiv

const base: FeedSchedule = { ...DEFAULT_FEED_SCHEDULE, enabled: true };

describe('kyivDate', () => {
  it('returns YYYY-MM-DD for a given UTC time in Kyiv TZ', () => {
    // 2026-01-15 02:00 UTC = 2026-01-15 04:00 Kyiv
    expect(kyivDate(AT_0400_CORRECT)).toBe('2026-01-15');
  });
});

describe('kyivIsAfter0400', () => {
  it('true at exactly 04:00 Kyiv', () => {
    expect(kyivIsAfter0400(AT_0400_CORRECT)).toBe(true);
  });
  it('false at 03:59 Kyiv', () => {
    expect(kyivIsAfter0400(BEFORE_0400_CORRECT)).toBe(false);
  });
  it('true at midday Kyiv', () => {
    expect(kyivIsAfter0400(MIDDAY)).toBe(true);
  });
});

describe('isScheduleDue', () => {
  it('true when enabled, after 04:00, no success today, no skip, no nextAttemptAt', () => {
    expect(isScheduleDue(base, MIDDAY)).toBe(true);
  });

  it('false when disabled', () => {
    expect(isScheduleDue({ ...base, enabled: false }, MIDDAY)).toBe(false);
  });

  it('false before 04:00', () => {
    expect(isScheduleDue(base, BEFORE_0400_CORRECT)).toBe(false);
  });

  it('false when lastSuccessDate is today', () => {
    expect(isScheduleDue({ ...base, lastSuccessDate: '2026-01-15' }, MIDDAY)).toBe(false);
  });

  it('false when skipDate is today', () => {
    expect(isScheduleDue({ ...base, skipDate: '2026-01-15' }, MIDDAY)).toBe(false);
  });

  it('false when nextAttemptAt is in the future', () => {
    const future = new Date(MIDDAY.getTime() + 5 * 60_000).toISOString();
    expect(isScheduleDue({ ...base, nextAttemptAt: future }, MIDDAY)).toBe(false);
  });

  it('true when nextAttemptAt is in the past', () => {
    const past = new Date(MIDDAY.getTime() - 1).toISOString();
    expect(isScheduleDue({ ...base, nextAttemptAt: past }, MIDDAY)).toBe(true);
  });

  it('catch-up: true when process was down at 04:00 and today has not succeeded', () => {
    // enabled, after 04:00, no success today, no skip => catch-up runs
    expect(isScheduleDue(base, MIDDAY)).toBe(true);
  });

  it('no catch-up when skipDate is today (Continue pressed after 04:00)', () => {
    expect(isScheduleDue({ ...base, skipDate: '2026-01-15' }, MIDDAY)).toBe(false);
  });
});

describe('applyContinue', () => {
  it('before 04:00: clears skipDate, enables', () => {
    const result = applyContinue({ ...DEFAULT_FEED_SCHEDULE, skipDate: '2026-01-15' }, BEFORE_0400_CORRECT);
    expect(result.enabled).toBe(true);
    expect(result.skipDate).toBeNull();
  });

  it('at/after 04:00: sets skipDate=today, enables', () => {
    const result = applyContinue({ ...DEFAULT_FEED_SCHEDULE }, MIDDAY);
    expect(result.enabled).toBe(true);
    expect(result.skipDate).toBe('2026-01-15');
  });
});

describe('applyStop', () => {
  it('sets enabled false, keeps lastSuccessDate', () => {
    const result = applyStop({ ...base, lastSuccessDate: '2026-01-14' });
    expect(result.enabled).toBe(false);
    expect(result.lastSuccessDate).toBe('2026-01-14');
  });
});
