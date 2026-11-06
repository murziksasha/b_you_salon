/**
 * Decision helper for TOTP login requirements.
 * File users never inherit the env/global secret. Env login never uses a file user's secret.
 */

export type TotpIdentity = 'file' | 'env';

export type TotpRequirementDecision =
  | { status: 'required'; secret: string; source: 'user' | 'global' }
  | { status: 'setup_required' }
  | { status: 'none' };

export interface DecideTotpRequirementParams {
  identity: TotpIdentity;
  role: string;
  personalSecret?: string;
  globalSecret?: string;
}

/**
 * - File user: personal secret -> required. If owner has no secret -> setup_required.
 *   Editor/operator without secret -> none (voluntary 2FA).
 * - Env / break-glass: global secret -> required. Without secret -> setup_required.
 */
export function decideTotpRequirement(params: DecideTotpRequirementParams): TotpRequirementDecision {
  if (params.identity === 'file') {
    if (params.personalSecret) {
      return { status: 'required', secret: params.personalSecret, source: 'user' };
    }
    if (params.role === 'owner') {
      return { status: 'setup_required' };
    }
    return { status: 'none' };
  }
  if (params.globalSecret) {
    return { status: 'required', secret: params.globalSecret, source: 'global' };
  }
  return { status: 'setup_required' };
}
