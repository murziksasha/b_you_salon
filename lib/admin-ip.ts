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

/**
 * Extract client IP from reverse proxy headers.
 *
 * Prefer X-Real-IP (set explicitly by trusted Nginx config).
 * For X-Forwarded-For, use the RIGHTMOST entry — leftmost hops are client-supplied.
 *
 * Nginx must OVERWRITE these headers (not $proxy_add_x_forwarded_for):
 *   proxy_set_header X-Real-IP $remote_addr;
 *   proxy_set_header X-Forwarded-For $remote_addr;
 */
export function clientIpFromHeaders(headers: Headers): string {
  // X-Real-IP is authoritative when set by the reverse proxy
  const real = headers.get('x-real-ip');
  if (real) return normalizeIp(real.trim());
  // Fallback: rightmost entry in X-Forwarded-For (added by trusted proxy)
  const forwarded = headers.get('x-forwarded-for');
  if (forwarded) {
    const parts = forwarded.split(',').map((s) => s.trim()).filter(Boolean);
    const last = parts[parts.length - 1];
    if (last) return normalizeIp(last);
  }
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
