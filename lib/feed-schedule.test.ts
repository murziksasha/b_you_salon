import { describe, expect, it, vi, beforeEach } from 'vitest';

vi.mock('fs', () => ({
  promises: {
    readFile: vi.fn(),
  },
}));

vi.mock('./atomic-write', () => ({
  atomicWriteJson: vi.fn().mockResolvedValue(undefined),
}));

import { promises as fs } from 'fs';
import { atomicWriteJson } from './atomic-write';
import {
  type FeedSchedule,
  DEFAULT_FEED_SCHEDULE,
  isScheduleDue,
  applyContinue,
  applyStop,
  kyivDate,
  kyivIsAfter0400,
  nextRunLabel,
  stampManualSuccessIfNeeded,
} from './feed-schedule';

const D = (iso: string) => new Date(iso);
// Europe/Kyiv is UTC+2 in winter
const AT_0400_CORRECT = D('2026-01-15T02:00:00.000Z');
const BEFORE_0400_CORRECT = D('2026-01-15T01:59:00.000Z');
const MIDDAY = D('2026-01-15T10:00:00.000Z'); // 12:00 Kyiv

const base: FeedSchedule = { ...DEFAULT_FEED_SCHEDULE, enabled: true };

describe('kyivDate', () => {
  it('returns YYYY-MM-DD for a given UTC time in Kyiv TZ', () => {
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

describe('nextRunLabel', () => {
  it('returns Зупинено when disabled', () => {
    expect(nextRunLabel({ ...base, enabled: false }, MIDDAY)).toBe('Зупинено');
  });

  it('returns Завтра 04:00 (Kyiv) when succeeded today', () => {
    expect(nextRunLabel({ ...base, lastSuccessDate: '2026-01-15' }, MIDDAY)).toBe('Завтра 04:00 (Kyiv)');
  });

  it('returns Завтра 04:00 (Kyiv) when skipDate is today after 04:00', () => {
    expect(nextRunLabel({ ...base, skipDate: '2026-01-15' }, MIDDAY)).toBe('Завтра 04:00 (Kyiv)');
  });

  it('returns Повтор when retry is scheduled in the future and today has not succeeded', () => {
    const future = new Date(MIDDAY.getTime() + 10 * 60_000).toISOString();
    const label = nextRunLabel({ ...base, nextAttemptAt: future }, MIDDAY);
    expect(label).toContain('Повтор о');
  });

  it('prioritizes success today over any stale nextAttemptAt', () => {
    const future = new Date(MIDDAY.getTime() + 10 * 60_000).toISOString();
    expect(nextRunLabel({ ...base, lastSuccessDate: '2026-01-15', nextAttemptAt: future }, MIDDAY)).toBe(
      'Завтра 04:00 (Kyiv)',
    );
  });

  it('returns Сьогодні 04:00 (Kyiv) before 04:00', () => {
    expect(nextRunLabel(base, BEFORE_0400_CORRECT)).toBe('Сьогодні 04:00 (Kyiv)');
  });
});

describe('stampManualSuccessIfNeeded', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('stamps lastSuccessDate and clears lastError/nextAttemptAt after 04:00 when enabled', async () => {
    vi.mocked(fs.readFile).mockResolvedValue(
      JSON.stringify({
        enabled: true,
        lastError: 'Feed failed at 04:00',
        lastErrorAt: '2026-01-15T02:00:00.000Z',
        nextAttemptAt: '2026-01-15T02:15:00.000Z',
      }),
    );

    const stamped = await stampManualSuccessIfNeeded(MIDDAY);
    expect(stamped).toBe(true);
    expect(atomicWriteJson).toHaveBeenCalledTimes(1);

    const saved = vi.mocked(atomicWriteJson).mock.calls[0]?.[1] as FeedSchedule;
    expect(saved.lastSuccessDate).toBe('2026-01-15');
    expect(saved.lastSuccessAt).toBe(MIDDAY.toISOString());
    expect(saved.lastError).toBeNull();
    expect(saved.lastErrorAt).toBeNull();
    expect(saved.nextAttemptAt).toBeNull();
  });

  it('does not stamp when before 04:00 (leaves morning job in place)', async () => {
    vi.mocked(fs.readFile).mockResolvedValue(JSON.stringify({ enabled: true }));

    const stamped = await stampManualSuccessIfNeeded(BEFORE_0400_CORRECT);
    expect(stamped).toBe(false);
    expect(atomicWriteJson).not.toHaveBeenCalled();
  });

  it('does not stamp when schedule is disabled', async () => {
    vi.mocked(fs.readFile).mockResolvedValue(JSON.stringify({ enabled: false }));

    const stamped = await stampManualSuccessIfNeeded(MIDDAY);
    expect(stamped).toBe(false);
    expect(atomicWriteJson).not.toHaveBeenCalled();
  });

  it('does not stamp when skipDate is today', async () => {
    vi.mocked(fs.readFile).mockResolvedValue(JSON.stringify({ enabled: true, skipDate: '2026-01-15' }));

    const stamped = await stampManualSuccessIfNeeded(MIDDAY);
    expect(stamped).toBe(false);
    expect(atomicWriteJson).not.toHaveBeenCalled();
  });

  it('does not re-stamp if today has already succeeded', async () => {
    vi.mocked(fs.readFile).mockResolvedValue(JSON.stringify({ enabled: true, lastSuccessDate: '2026-01-15' }));

    const stamped = await stampManualSuccessIfNeeded(MIDDAY);
    expect(stamped).toBe(false);
    expect(atomicWriteJson).not.toHaveBeenCalled();
  });
});
