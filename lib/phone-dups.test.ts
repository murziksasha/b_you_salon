import { describe, expect, it } from 'vitest';
import { buildPhoneCounts, isDuplicatePhone, phoneDigits } from './phone-dups';

describe('phone-dups', () => {
  it('normalizes digits', () => {
    expect(phoneDigits('+38 (067) 123-45-67')).toBe('380671234567');
  });

  it('flags duplicates', () => {
    const counts = buildPhoneCounts(['+380671111111', '0671111111', '+380672222222']);
    // 0671111111 → 0671111111 vs 380671111111 — different digit strings
    // same full form:
    const c2 = buildPhoneCounts(['+380671111111', '380671111111', '+380672222222']);
    expect(isDuplicatePhone('+380671111111', c2)).toBe(true);
    expect(isDuplicatePhone('+380672222222', c2)).toBe(false);
  });
});
