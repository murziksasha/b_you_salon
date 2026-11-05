import dns from 'dns/promises';
import net from 'net';
import { Agent } from 'undici';

function parseIPv6Words(ip: string): number[] | null {
  let s = ip.trim().toLowerCase();
  const lastColon = s.lastIndexOf(':');
  if (lastColon >= 0 && s.slice(lastColon + 1).includes('.')) {
    const v4 = s.slice(lastColon + 1);
    const parts = v4.split('.').map(Number);
    if (parts.length !== 4 || parts.some((p) => isNaN(p) || p < 0 || p > 255)) return null;
    const hex1 = ((parts[0] << 8) | parts[1]).toString(16);
    const hex2 = ((parts[2] << 8) | parts[3]).toString(16);
    s = s.slice(0, lastColon) + ':' + hex1 + ':' + hex2;
  }
  const doubleColon = s.indexOf('::');
  let parts: string[];
  if (doubleColon >= 0) {
    const left = s.slice(0, doubleColon) ? s.slice(0, doubleColon).split(':') : [];
    const right = s.slice(doubleColon + 2) ? s.slice(doubleColon + 2).split(':') : [];
    const missing = 8 - (left.length + right.length);
    if (missing < 1) return null;
    parts = [...left, ...Array(missing).fill('0'), ...right];
  } else {
    parts = s.split(':');
  }
  if (parts.length !== 8) return null;
  const words = parts.map((p) => parseInt(p, 16));
  if (words.some((w) => isNaN(w) || w < 0 || w > 0xffff)) return null;
  return words;
}

/**
 * Checks whether an IP string is a private, loopback, link-local, or reserved address.
 * Covers IPv4, canonical & expanded IPv6, IPv4-mapped IPv6, NAT64, and 6to4.
 */
export function isPrivateIp(ip: string): boolean {
  if (!ip || typeof ip !== 'string') return true;
  const trimmed = ip.trim().toLowerCase();

  // IPv4 validation
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

  // IPv6 validation
  const words = parseIPv6Words(trimmed);
  if (!words) return true; // Malformed IP string -> fail closed

  // 1. IPv4-mapped IPv6 (::ffff:0:0/96 in any form: expanded, compressed, dot or hex)
  if (words[0] === 0 && words[1] === 0 && words[2] === 0 && words[3] === 0 && words[4] === 0 && words[5] === 0xffff) {
    const a = (words[6] >> 8) & 0xff;
    const b = words[6] & 0xff;
    const c = (words[7] >> 8) & 0xff;
    const d = words[7] & 0xff;
    return isPrivateIp(`${a}.${b}.${c}.${d}`);
  }

  // 2. IPv4-compatible IPv6 (::/96)
  if (words[0] === 0 && words[1] === 0 && words[2] === 0 && words[3] === 0 && words[4] === 0 && words[5] === 0) {
    if (words[6] === 0 && words[7] === 1) return true; // ::1
    if (words[6] === 0 && words[7] === 0) return true; // ::
    const a = (words[6] >> 8) & 0xff;
    const b = words[6] & 0xff;
    const c = (words[7] >> 8) & 0xff;
    const d = words[7] & 0xff;
    return isPrivateIp(`${a}.${b}.${c}.${d}`);
  }

  // 3. NAT64 Well-Known Prefix (64:ff9b::/96)
  if (words[0] === 0x0064 && words[1] === 0xff9b && words[2] === 0 && words[3] === 0 && words[4] === 0 && words[5] === 0) {
    const a = (words[6] >> 8) & 0xff;
    const b = words[6] & 0xff;
    const c = (words[7] >> 8) & 0xff;
    const d = words[7] & 0xff;
    return isPrivateIp(`${a}.${b}.${c}.${d}`);
  }

  // 4. 6to4 prefix (2002::/16) embeds IPv4 in words 1 and 2
  if (words[0] === 0x2002) {
    const a = (words[1] >> 8) & 0xff;
    const b = words[1] & 0xff;
    const c = (words[2] >> 8) & 0xff;
    const d = words[2] & 0xff;
    if (isPrivateIp(`${a}.${b}.${c}.${d}`)) return true;
  }

  // 5. Standard IPv6 reserved / private ranges
  // Loopback ::1, Unspecified ::
  if (words.every((w, i) => (i === 7 ? w === 1 || w === 0 : w === 0))) return true;

  // fe80::/10 link-local
  if ((words[0] & 0xffc0) === 0xfe80) return true;

  // fc00::/7 unique local (RFC4193)
  if ((words[0] & 0xfe00) === 0xfc00) return true;

  // 2001:db8::/32 documentation
  if (words[0] === 0x2001 && words[1] === 0x0db8) return true;

  // 100::/64 discard prefix (RFC6666)
  if (words[0] === 0x0100 && words[1] === 0 && words[2] === 0 && words[3] === 0) return true;

  // ff00::/8 multicast
  if ((words[0] & 0xff00) === 0xff00) return true;

  return false;
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
      try {
        await res.body?.cancel();
        await dispatcher.close();
      } catch {
        /* ignore close error */
      }
      const location = res.headers.get('location');
      if (!location) throw new Error('Redirect missing location header');
      currentUrl = new URL(location, currentUrl).toString();
      continue;
    }

    return res;
  }

  throw new Error('Too many redirects');
}

/**
 * Reads a ReadableStream up to maxBytes. Aborts and throws if maxBytes is exceeded.
 */
export async function readBoundedStream(
  stream: ReadableStream<Uint8Array> | null,
  maxBytes: number,
  signal?: AbortSignal,
): Promise<Buffer> {
  if (!stream) return Buffer.alloc(0);
  const reader = stream.getReader();
  const chunks: Uint8Array[] = [];
  let totalBytes = 0;

  try {
    while (true) {
      if (signal?.aborted) {
        throw new Error('Stream read aborted');
      }
      const { done, value } = await reader.read();
      if (done) break;
      if (value) {
        totalBytes += value.byteLength;
        if (totalBytes > maxBytes) {
          throw new Error(`Response body exceeded limit of ${maxBytes} bytes`);
        }
        chunks.push(value);
      }
    }
  } finally {
    reader.releaseLock();
  }

  return Buffer.concat(chunks);
}
