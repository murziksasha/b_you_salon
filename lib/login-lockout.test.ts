import { beforeEach, describe, expect, it } from 'vitest';
import { _resetAllLockouts, lockoutRetryAfterSec, recordLoginFailure, resetLoginFailures } from './login-lockout';

describe('login lockout', () => {
  beforeEach(() => _resetAllLockouts());

  it('locks a username after 5 failures in the window', () => {
    const t = 1_000_000;
    for (let i = 0; i < 4; i++) expect(recordLoginFailure('Bob', t + i)).toBe(false);
    expect(recordLoginFailure('bob', t + 5)).toBe(true);
    expect(lockoutRetryAfterSec('BOB', t + 10)).toBeGreaterThan(0);
    expect(lockoutRetryAfterSec('alice', t + 10)).toBe(0);
  });

  it('expires and resets', () => {
    for (let i = 0; i < 5; i++) recordLoginFailure('bob', i);
    expect(lockoutRetryAfterSec('bob', 16 * 60_000)).toBe(0);
    for (let i = 0; i < 5; i++) recordLoginFailure('carl', i);
    resetLoginFailures('carl');
    expect(lockoutRetryAfterSec('carl', 10)).toBe(0);
  });
});
