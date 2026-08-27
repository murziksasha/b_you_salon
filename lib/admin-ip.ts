/**
 * Optional LAN protection: comma-separated list of allowed client IPs.
 * Empty / unset = allow everyone (default).
 * Example: ADMIN_IP_ALLOWLIST=192.168.1.10,127.0.0.1,::1
 */
export function getAdminIpAllowlist(): string[] {
  const raw = process.env.ADMIN_IP_ALLOWLIST || process.env['ADMIN_IP_ALLOWLIST'] || '';
  return raw
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);
}

export function clientIpFromHeaders(headers: Headers): string {
  const forwarded = headers.get('x-forwarded-for');
  if (forwarded) {
    const first = forwarded.split(',')[0]?.trim();
    if (first) return normalizeIp(first);
  }
  const real = headers.get('x-real-ip');
  if (real) return normalizeIp(real);
  return '';
}

function normalizeIp(ip: string): string {
  // Strip IPv4-mapped IPv6 prefix
  if (ip.startsWith('::ffff:')) return ip.slice(7);
  return ip;
}

/** Returns true if request may access admin/API. Empty allowlist always true. */
export function isIpAllowed(ip: string, allowlist: string[] = getAdminIpAllowlist()): boolean {
  if (allowlist.length === 0) return true;
  if (!ip) return false;
  const n = normalizeIp(ip);
  return allowlist.some((allowed) => normalizeIp(allowed) === n);
}
