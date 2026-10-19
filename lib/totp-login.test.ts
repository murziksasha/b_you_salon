import { describe, expect, it } from 'vitest';
import { decideTotpRequirement } from './totp-login';

describe('lib/totp-login decideTotpRequirement', () => {
  describe('Flag off (requireTotp = false)', () => {
    it('returns personal secret when user has one', () => {
      const decision = decideTotpRequirement({
        requireTotp: false,
        userTotpSecret: 'USER_SECRET_123',
        globalTotpSecret: 'GLOBAL_SECRET_456',
      });
      expect(decision).toEqual({
        status: 'required',
        secret: 'USER_SECRET_123',
        source: 'user',
      });
    });

    it('falls back to global secret when user has no personal secret', () => {
      const decision = decideTotpRequirement({
        requireTotp: false,
        userTotpSecret: undefined,
        globalTotpSecret: 'GLOBAL_SECRET_456',
      });
      expect(decision).toEqual({
        status: 'required',
        secret: 'GLOBAL_SECRET_456',
        source: 'global',
      });
    });

    it('returns none when neither secret exists', () => {
      const decision = decideTotpRequirement({
        requireTotp: false,
        userTotpSecret: undefined,
        globalTotpSecret: undefined,
      });
      expect(decision).toEqual({ status: 'none' });
    });
  });

  describe('Flag on (requireTotp = true)', () => {
    it('requires personal secret when user has one', () => {
      const decision = decideTotpRequirement({
        requireTotp: true,
        userTotpSecret: 'USER_SECRET_ABC',
        globalTotpSecret: 'GLOBAL_SECRET_XYZ',
      });
      expect(decision).toEqual({
        status: 'required',
        secret: 'USER_SECRET_ABC',
        source: 'user',
      });
    });

    it('rejects with code PERSONAL_TOTP_REQUIRED when user lacks personal secret and not break-glass', () => {
      const decision = decideTotpRequirement({
        requireTotp: true,
        userTotpSecret: undefined,
        globalTotpSecret: 'GLOBAL_SECRET_XYZ',
        isBreakglass: false,
      });
      expect(decision).toEqual({
        status: 'rejected_missing_personal',
        error: 'Personal TOTP required',
        code: 'PERSONAL_TOTP_REQUIRED',
      });
    });

    it('rejects even when global secret is present outside of break-glass', () => {
      const decision = decideTotpRequirement({
        requireTotp: true,
        userTotpSecret: undefined,
        globalTotpSecret: 'GLOBAL_SECRET_XYZ',
      });
      expect(decision.status).toBe('rejected_missing_personal');
    });

    describe('Break-glass with Flag on', () => {
      it('allows through personal-secret check and verifies global secret if configured', () => {
        const decision = decideTotpRequirement({
          requireTotp: true,
          userTotpSecret: undefined,
          globalTotpSecret: 'GLOBAL_SECRET_XYZ',
          isBreakglass: true,
        });
        expect(decision).toEqual({
          status: 'required',
          secret: 'GLOBAL_SECRET_XYZ',
          source: 'global',
        });
      });

      it('allows through without 2FA if no global secret is configured in break-glass', () => {
        const decision = decideTotpRequirement({
          requireTotp: true,
          userTotpSecret: undefined,
          globalTotpSecret: undefined,
          isBreakglass: true,
        });
        expect(decision).toEqual({ status: 'none' });
      });
    });
  });
});

