const LOOPBACK = /^(localhost|127\.0\.0\.1|0\.0\.0\.0|\[::1\]|::1)$/i;

export function stripTrailingSlash(url: string): string {
  return url.replace(/\/+$/, '');
}

/** True when the value is a loopback host or origin (not usable by social crawlers). */
export function isLocalhostOrigin(urlOrHost: string): boolean {
  const raw = urlOrHost.trim();
  if (!raw) return false;
  try {
    const hostname = raw.includes('://')
      ? new URL(raw).hostname
      : raw.replace(/^\[([^\]]+)\](?::\d+)?$/, '$1').replace(/:\d+$/, '');
    return LOOPBACK.test(hostname);
  } catch {
    return /localhost|127\.0\.0\.1|\[::1\]/i.test(raw);
  }
}

type EnvLike = Record<string, string | undefined>;

/** Public SITE_URL from env, or undefined when missing / localhost. */
export function originFromEnv(env: EnvLike = process.env): string | undefined {
  const raw = env.SITE_URL?.trim();
  if (!raw) return undefined;
  const origin = stripTrailingSlash(raw);
  if (isLocalhostOrigin(origin)) return undefined;
  return origin;
}

export function originFromHeaders(headers: Headers): string | undefined {
  const host = (headers.get('x-forwarded-host') || headers.get('host') || '')
    .split(',')[0]
    .trim();
  if (!host) return undefined;
  const forwarded = (headers.get('x-forwarded-proto') || '').split(',')[0].trim();
  // Keenetic/nginx often terminate TLS and proxy HTTP ($scheme=http). Social
  // crawlers need https og:image, so non-loopback always uses https.
  const proto = isLocalhostOrigin(host) ? forwarded || 'http' : 'https';
  return stripTrailingSlash(`${proto}://${host}`);
}

/**
 * Origin for sitemap / Open Graph / JSON-LD.
 * Prefer a non-localhost SITE_URL; otherwise use the incoming Host
 * so Keenetic/nginx still emit https://beyou… even if .env is localhost.
 */
export function resolvePublicSiteUrl(
  headers?: Headers | null,
  env: EnvLike = process.env,
): string | undefined {
  return originFromEnv(env) || (headers ? originFromHeaders(headers) : undefined);
}

export function absoluteUrl(path: string, siteUrl?: string): string {
  const normalized = path.startsWith('/') ? path : `/${path}`;
  if (!siteUrl) return normalized;
  if (normalized === '/') return stripTrailingSlash(siteUrl) + '/';
  return `${stripTrailingSlash(siteUrl)}${normalized}`;
}
