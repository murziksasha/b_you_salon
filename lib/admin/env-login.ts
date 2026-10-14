import { listAdminUsers } from '@/lib/admin-users';

export type EnvLoginMode = 'always' | 'auto' | 'breakglass' | 'off';

/**
 * ADMIN_ENV_LOGIN controls whether the env ADMIN_PASSWORD may log in as "admin" (owner):
 * - always (default, backward compatible): env password always works.
 * - auto: works only while there is no enabled owner in admins.json.
 * - breakglass: works only when ADMIN_BREAKGLASS=1 (temporary recovery; audited + alerted).
 * - off: never.
 */
export function envLoginMode(): EnvLoginMode {
  const v = (process.env.ADMIN_ENV_LOGIN || 'always').trim().toLowerCase();
  if (v === 'auto' || v === 'breakglass' || v === 'off') return v;
  return 'always';
}

export function isBreakglassActive(): boolean {
  return envLoginMode() === 'breakglass' && process.env.ADMIN_BREAKGLASS === '1';
}

export async function hasEnabledOwner(): Promise<boolean> {
  return (await listAdminUsers()).some((u) => u.role === 'owner' && !u.disabled);
}

export async function isEnvLoginAllowed(): Promise<boolean> {
  const mode = envLoginMode();
  if (mode === 'always') return true;
  if (mode === 'off') return false;
  if (mode === 'breakglass') return isBreakglassActive();
  return !(await hasEnabledOwner());
}
