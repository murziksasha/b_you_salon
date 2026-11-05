/**
 * Decision helper for TOTP login requirements.
 * File users never inherit the env/global secret. Env login never uses a file user's secret.
 */

export type TotpIdentity = 'file' | 'env';

export type TotpRequirementDecision =
  | { status: 'required'; secret: string; source: 'user' | 'global' }
  | { status: 'none' };

export interface DecideTotpRequirementParams {
  identity: TotpIdentity;
  personalSecret?: string;
  globalSecret?: string;
}

/**
 * - File user: personal secret, or none. Global secret and ADMIN_REQUIRE_TOTP are ignored.
 * - Env / break-glass (`viaEnvPassword`): global secret if configured, else none.
 */
export function decideTotpRequirement(params: DecideTotpRequirementParams): TotpRequirementDecision {
  if (params.identity === 'file') {
    if (params.personalSecret) {
      return { status: 'required', secret: params.personalSecret, source: 'user' };
    }
    return { status: 'none' };
  }
  if (params.globalSecret) {
    return { status: 'required', secret: params.globalSecret, source: 'global' };
  }
  return { status: 'none' };
}
