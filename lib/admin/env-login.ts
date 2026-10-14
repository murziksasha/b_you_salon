/**
 * Whether the env ADMIN_PASSWORD may be used to log in (and as an identity fallback).
 * Stage 1 placeholder: always allowed. Stage 8 introduces ADMIN_ENV_LOGIN modes.
 */
export async function isEnvLoginAllowed(): Promise<boolean> {
  return true;
}
