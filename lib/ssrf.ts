import dns from 'dns/promises';
import net from 'net';
import { Agent } from 'undici';

/**
 * Checks whether an IP string is a private, loopback, link-local, or reserved address.
 * Covers IPv4, IPv6, and IPv4-mapped IPv6.
 */
export function isPrivateIp(ip: string): boolean {
  if (!ip || typeof ip !== 'string') return true;
  const trimmed = ip.trim().toLowerCase();

  // Handle IPv4-mapped IPv6 (e.g., ::ffff:127.0.0.1 or ::ffff:7f00:1)
  if (trimmed.startsWith('::ffff:')) {
    const rest = trimmed.slice(7);
    if (net.isIPv4(rest)) {
      return isPrivateIp(rest);
    }
    // Hex format, e.g. 7f00:0001
    const parts = rest.split(':');
    if (parts.length === 2) {
      const p1 = parseInt(parts[0], 16);
      const p2 = parseInt(parts[1], 16);
      if (!isNaN(p1) && !isNaN(p2)) {
        const a = (p1 >> 8) & 0xff;
        const b = p1 & 0xff;
        const c = (p2 >> 8) & 0xff;
        const d = p2 & 0xff;
        return isPrivateIp(`${a}.${b}.${c}.${d}`);
      }
    }
    return true;
  }

  // Handle NAT64 Well-Known Prefix (64:ff9b::/96)
  if (trimmed.startsWith('64:ff9b::')) {
    const rest = trimmed.slice(9);
    if (net.isIPv4(rest)) {
      return isPrivateIp(rest);
    }
    return true;
  }

  if (net.isIPv4(trimmed)) {
    const parts = trimmed.split('.').map(Number);
    if (parts.length !== 4 || parts.some((p) => isNaN(p) || p < 0 || p > 255)) return true;
    const [a, b] = parts;
    if (a === 0) return true; // 0.0.0.0/8 current network
    if (a === 127) return true; // 127.0.0.0/8 loopback
    if (a === 10) return true; // 10.0.0.0/8 RFC1918
    if (a === 172 && b >= 16 && b <= 31) return true; // 172.16.0.0/12 RFC1918
    if (a === 192 && b === 168) return true; // 192.168.0.0/16 RFC1918
    if (a === 169 && b === 254) return true; // 169.254.0.0/16 link-local / metadata
    if (a === 100 && b >= 64 && b <= 127) return true; // 100.64.0.0/10 CGNAT
    if (a === 192 && b === 0 && parts[2] === 0) return true; // 192.0.0.0/24 IETF protocol assignments
    if (a === 192 && b === 0 && parts[2] === 2) return true; // 192.0.2.0/24 TEST-NET-1
    if (a === 198 && (b === 18 || b === 19)) return true; // 198.18.0.0/15 benchmarking
    if (a === 198 && b === 51 && parts[2] === 100) return true; // 198.51.100.0/24 TEST-NET-2
    if (a === 203 && b === 0 && parts[2] === 113) return true; // 203.0.113.0/24 TEST-NET-3
    if (a >= 224) return true; // 224.0.0.0/4 multicast, reserved, broadcast
    return false;
  }

  if (net.isIPv6(trimmed)) {
    if (trimmed === '::1' || trimmed === '::') return true;
    if (
      trimmed.startsWith('fe8') ||
      trimmed.startsWith('fe9') ||
      trimmed.startsWith('fea') ||
      trimmed.startsWith('feb')
    ) {
      return true; // fe80::/10 link-local
    }
    if (trimmed.startsWith('fc') || trimmed.startsWith('fd')) {
      return true; // fc00::/7 unique local (RFC4193)
    }
    if (trimmed.startsWith('2001:db8:')) return true; // documentation
    if (trimmed.startsWith('ff')) return true; // multicast
    return false;
  }

  return true;
}

export interface VettedAddress {
  address: string;
  family: 4 | 6;
}

/**
 * Resolves all addresses for a host and verifies none are private.
 * Fails closed if any address is private or if no addresses exist.
 */
export async function resolveAndValidateHost(host: string): Promise<VettedAddress> {
  const normalized = host.toLowerCase();
  if (normalized === 'localhost' || normalized.endsWith('.localhost')) {
    throw new Error(`SSRF blocked: local hostname ${host}`);
  }

  if (net.isIP(normalized)) {
    if (isPrivateIp(normalized)) {
      throw new Error(`SSRF blocked: private IP address ${normalized}`);
    }
    const family = net.isIPv6(normalized) ? 6 : 4;
    return { address: normalized, family };
  }

  const addresses = await dns.lookup(normalized, { all: true });
  if (!addresses || addresses.length === 0) {
    throw new Error(`SSRF blocked: host ${host} resolved to no addresses`);
  }

  // Reject mixed-address results where any resolved IP is private
  for (const addr of addresses) {
    if (isPrivateIp(addr.address)) {
      throw new Error(`SSRF blocked: host ${host} resolves to private IP ${addr.address}`);
    }
  }

  const selected = addresses[0];
  return {
    address: selected.address,
    family: selected.family === 6 ? 6 : 4,
  };
}

/**
 * Validates that a URL is http/https and does not resolve to private/local networks.
 */
export async function isSafePublicUrl(urlString: string): Promise<boolean> {
  try {
    const parsed = new URL(urlString);
    if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') return false;
    await resolveAndValidateHost(parsed.hostname);
    return true;
  } catch {
    return false;
  }
}

/**
 * Creates an undici Agent that pins DNS lookup to the pre-vetted IP address,
 * eliminating the DNS-rebinding race condition while retaining TLS SNI and Host headers.
 */
export function createPinnedDispatcher(vetted: VettedAddress): Agent {
  return new Agent({
    connect: {
      lookup: (_hostname, _opts, callback) => {
        callback(null, [{ address: vetted.address, family: vetted.family }]);
      },
    },
  });
}

/**
 * Safe fetch wrapper with SSRF protection, DNS rebinding elimination via pinned dispatcher,
 * and validated redirect handling.
 */
export async function safeFetch(
  urlString: string,
  options: RequestInit & { maxRedirects?: number } = {},
): Promise<Response> {
  let currentUrl = urlString;
  const maxRedirects = options.maxRedirects ?? 3;

  for (let i = 0; i <= maxRedirects; i++) {
    const parsed = new URL(currentUrl);
    if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
      throw new Error(`SSRF blocked: unsupported protocol ${parsed.protocol}`);
    }

    const vetted = await resolveAndValidateHost(parsed.hostname);
    const dispatcher = createPinnedDispatcher(vetted);

    const { maxRedirects: _m, ...fetchOpts } = options;
    const res = await fetch(currentUrl, {
      ...fetchOpts,
      // @ts-expect-error undici dispatcher option for node fetch
      dispatcher,
      redirect: 'manual',
    });

    if ([301, 302, 303, 307, 308].includes(res.status)) {
      const location = res.headers.get('location');
      if (!location) throw new Error('Redirect missing location header');
      currentUrl = new URL(location, currentUrl).toString();
      continue;
    }

    return res;
  }

  throw new Error('Too many redirects');
}
