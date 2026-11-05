import { describe, expect, it } from 'vitest';
import { decideTotpRequirement } from './totp-login';

describe('lib/totp-login decideTotpRequirement', () => {
  it('requires personal secret for a file user when configured', () => {
    expect(
      decideTotpRequirement({
        identity: 'file',
        role: 'operator',
        personalSecret: 'USER_SECRET_123',
        globalSecret: 'GLOBAL_SECRET_456',
      }),
    ).toEqual({ status: 'required', secret: 'USER_SECRET_123', source: 'user' });
  });

  it('requires setup for an owner without personal secret', () => {
    expect(
      decideTotpRequirement({
        identity: 'file',
        role: 'owner',
        personalSecret: undefined,
        globalSecret: 'GLOBAL_SECRET_456',
      }),
    ).toEqual({ status: 'setup_required' });
  });

  it('returns none when an editor or operator has no personal secret', () => {
    expect(
      decideTotpRequirement({
        identity: 'file',
        role: 'editor',
      }),
    ).toEqual({ status: 'none' });

    expect(
      decideTotpRequirement({
        identity: 'file',
        role: 'operator',
      }),
    ).toEqual({ status: 'none' });
  });

  it('requires global secret for env login', () => {
    expect(
      decideTotpRequirement({
        identity: 'env',
        role: 'owner',
        personalSecret: 'USER_SECRET_123',
        globalSecret: 'GLOBAL_SECRET_456',
      }),
    ).toEqual({ status: 'required', secret: 'GLOBAL_SECRET_456', source: 'global' });
  });

  it('returns setup_required for env login when no global secret is configured', () => {
    expect(
      decideTotpRequirement({
        identity: 'env',
        role: 'owner',
      }),
    ).toEqual({ status: 'setup_required' });
  });
});
