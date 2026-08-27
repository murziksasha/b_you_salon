import { describe, expect, it } from 'vitest';
import { matchesPhoneQuery, matchesTimeFilter } from './journal-filter';

describe('journal-filter', () => {
  const now = new Date('2026-07-19T12:00:00.000Z');

  it('time filters', () => {
    expect(matchesTimeFilter('2026-07-19T08:00:00.000Z', 'today', now)).toBe(true);
    expect(matchesTimeFilter('2026-07-18T08:00:00.000Z', 'today', now)).toBe(false);
    expect(matchesTimeFilter('2026-07-15T08:00:00.000Z', 'week', now)).toBe(true);
    expect(matchesTimeFilter('2026-07-01T08:00:00.000Z', 'week', now)).toBe(false);
    expect(matchesTimeFilter('2020-01-01T00:00:00.000Z', 'all', now)).toBe(true);
  });

  it('phone query', () => {
    expect(matchesPhoneQuery('+380501112233', '5011')).toBe(true);
    expect(matchesPhoneQuery('+380501112233', '999')).toBe(false);
    expect(matchesPhoneQuery('+380501112233', '')).toBe(true);
  });
});
