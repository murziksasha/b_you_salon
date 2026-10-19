/**
 * Decision helper for TOTP login requirements.
 */

export type TotpRequirementDecision =
  | { status: 'required'; secret: string; source: 'user' | 'global' }
  | { status: 'none' }
  | { status: 'rejected_missing_personal'; error: string; code: 'PERSONAL_TOTP_REQUIRED' };

export interface DecideTotpRequirementParams {
  requireTotp: boolean;
  userTotpSecret?: string;
  globalTotpSecret?: string;
  isBreakglass?: boolean;
}

/**
 * Pure decision helper for TOTP enforcement during admin login.
 *
 * Rules:
 * - Flag off (requireTotp=false): today's behavior (personal secret, otherwise global secret).
 * - Flag on, user has personal secret: require personal TOTP.
 * - Flag on, no personal secret, not break-glass: 401 rejection (code: PERSONAL_TOTP_REQUIRED).
 * - Flag on, break-glass env login: bypass personal secret check; require global secret if configured.
 */
export function decideTotpRequirement(params: DecideTotpRequirementParams): TotpRequirementDecision {
  const { requireTotp, userTotpSecret, globalTotpSecret, isBreakglass = false } = params;

  if (requireTotp) {
    if (userTotpSecret) {
      return { status: 'required', secret: userTotpSecret, source: 'user' };
    }
    if (isBreakglass) {
      if (globalTotpSecret) {
        return { status: 'required', secret: globalTotpSecret, source: 'global' };
      }
      return { status: 'none' };
    }
    return {
      status: 'rejected_missing_personal',
      error: 'Personal TOTP required',
      code: 'PERSONAL_TOTP_REQUIRED',
    };
  }

  // Flag off: transitional mode
  if (userTotpSecret) {
    return { status: 'required', secret: userTotpSecret, source: 'user' };
  }
  if (globalTotpSecret) {
    return { status: 'required', secret: globalTotpSecret, source: 'global' };
  }
  return { status: 'none' };
}

