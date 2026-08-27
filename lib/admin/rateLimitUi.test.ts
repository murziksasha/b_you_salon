import { describe, expect, it } from 'vitest';
import {
  formatCountdown,
  parseRetryAfterSeconds,
  rateLimitMessage,
} from './rateLimitUi';

describe('rateLimitUi', () => {
  it('parses Retry-After header', () => {
    const res = new Response(null, {
      status: 429,
      headers: { 'Retry-After': '42' },
    });
    expect(parseRetryAfterSeconds(res)).toBe(42);
  });

  it('falls back when header missing', () => {
    const res = new Response(null, { status: 429 });
    expect(parseRetryAfterSeconds(res, 60)).toBe(60);
  });

  it('formats countdown', () => {
    expect(formatCountdown(5)).toBe('5 с');
    expect(formatCountdown(65)).toBe('1 хв 5 с');
    expect(formatCountdown(120)).toBe('2 хв');
  });

  it('builds login message', () => {
    expect(rateLimitMessage(30, 'login')).toContain('30 с');
    expect(rateLimitMessage(0, 'login')).toContain('хвилину');
  });
});
