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

let warnedUnsetTrustProxy = false;

/**
 * TRUST_PROXY controls whether X-Real-IP / X-Forwarded-For are trusted.
 * - "true": a trusted reverse proxy (nginx) overwrites these headers -> trust them.
 * - "false": no proxy in front of Next.js -> headers are client-controlled and ignored.
 *   Next.js route handlers do not expose the socket IP, so the client IP is unknown and
 *   ADMIN_IP_ALLOWLIST fails closed.
 * - unset: legacy behaviour (trust headers) with a one-time warning. Set it explicitly.
 */
export function trustProxyMode(): 'true' | 'false' | 'unset' {
  const v = (process.env.TRUST_PROXY || '').trim().toLowerCase();
  if (v === 'true' || v === '1') return 'true';
  if (v === 'false' || v === '0') return 'false';
  return 'unset';
}

/**
 * Extract client IP from reverse proxy headers (only when the proxy is trusted).
 *
 * Prefer X-Real-IP (set explicitly by trusted Nginx config).
 * For X-Forwarded-For, use the RIGHTMOST entry — leftmost hops are client-supplied.
 *
 * Nginx must OVERWRITE these headers (not $proxy_add_x_forwarded_for):
 *   proxy_set_header X-Real-IP $remote_addr;
 *   proxy_set_header X-Forwarded-For $remote_addr;
 */
export function clientIpFromHeaders(headers: Headers): string {
  const mode = trustProxyMode();
  if (mode === 'false') return '';
  if (mode === 'unset' && !warnedUnsetTrustProxy && getAdminIpAllowlist().length > 0) {
    warnedUnsetTrustProxy = true;
    console.warn(
      '[admin-ip] TRUST_PROXY is not set: trusting X-Real-IP/X-Forwarded-For for ADMIN_IP_ALLOWLIST. ' +
        'Set TRUST_PROXY=true behind nginx or TRUST_PROXY=false when Next.js is exposed directly.',
    );
  }
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
