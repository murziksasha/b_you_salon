import { headers } from 'next/headers';
import { clientIpFromHeaders, getAdminIpAllowlist, isIpAllowed } from './admin-ip';

/** Node-side IP gate (reliable with Docker runtime env). Throws Response-like via return. */
export async function assertAdminIp(): Promise<{ ok: true } | { ok: false; status: number; error: string }> {
  const allowlist = getAdminIpAllowlist();
  if (allowlist.length === 0) return { ok: true };

  const h = await headers();
  const ip = clientIpFromHeaders(h);
  if (!isIpAllowed(ip, allowlist)) {
    return { ok: false, status: 403, error: 'Forbidden (IP not allowed)' };
  }
  return { ok: true };
}
