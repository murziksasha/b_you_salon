import { describe, expect, it } from 'vitest';
import { timingSafeCompare } from './timing-safe';

describe('timingSafeCompare', () => {
  it('returns true for identical strings', () => {
    expect(timingSafeCompare('my-secret-token', 'my-secret-token')).toBe(true);
    expect(timingSafeCompare('long-secret-key-1234567890', 'long-secret-key-1234567890')).toBe(true);
  });

  it('returns false for different strings', () => {
    expect(timingSafeCompare('secret-a', 'secret-b')).toBe(false);
    expect(timingSafeCompare('secret', 'secret-longer')).toBe(false);
  });

  it('returns false for empty, null, or undefined values', () => {
    expect(timingSafeCompare('', 'secret')).toBe(false);
    expect(timingSafeCompare('secret', '')).toBe(false);
    expect(timingSafeCompare(null, 'secret')).toBe(false);
    expect(timingSafeCompare('secret', undefined)).toBe(false);
    expect(timingSafeCompare('', '')).toBe(false);
  });
});

