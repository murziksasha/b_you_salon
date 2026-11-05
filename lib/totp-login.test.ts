import { describe, expect, it } from 'vitest';
import { decideTotpRequirement } from './totp-login';

describe('lib/totp-login decideTotpRequirement', () => {
  it('requires the personal secret for a file user', () => {
    expect(
      decideTotpRequirement({
        identity: 'file',
        personalSecret: 'USER_SECRET_123',
        globalSecret: 'GLOBAL_SECRET_456',
      }),
    ).toEqual({ status: 'required', secret: 'USER_SECRET_123', source: 'user' });
  });

  it('does not fall back to the global secret for a file user', () => {
    expect(
      decideTotpRequirement({
        identity: 'file',
        personalSecret: undefined,
        globalSecret: 'GLOBAL_SECRET_456',
      }),
    ).toEqual({ status: 'none' });
  });

  it('returns none when a file user has no personal secret', () => {
    expect(decideTotpRequirement({ identity: 'file' })).toEqual({ status: 'none' });
  });

  it('requires the global secret for env login', () => {
    expect(
      decideTotpRequirement({
        identity: 'env',
        personalSecret: 'USER_SECRET_123',
        globalSecret: 'GLOBAL_SECRET_456',
      }),
    ).toEqual({ status: 'required', secret: 'GLOBAL_SECRET_456', source: 'global' });
  });

  it('returns none for env login when no global secret is configured', () => {
    expect(decideTotpRequirement({ identity: 'env', personalSecret: 'USER_SECRET_123' })).toEqual({
      status: 'none',
    });
  });
});
