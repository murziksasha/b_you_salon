import { NextRequest, NextResponse } from 'next/server';
import { isKnownAdminPath } from '@/lib/admin-paths';
import { clientIpFromHeaders, getAdminIpAllowlist, isIpAllowed } from '@/lib/admin-ip';
import { SESSION_COOKIE } from '@/lib/session';

/**
 * Middleware only does a cheap cookie-presence check + optional IP allowlist + origin check.
 * Full HMAC validation and role checks run in Node (route handlers / admin pages).
 *
 * Deny-by-default: every /api/* route is treated as admin API (IP allowlist + same-origin for
 * state-changing methods) unless listed in PUBLIC_API below.
 */
type PublicRule = { path: string; prefix?: boolean; methods?: readonly string[] };

export const PUBLIC_API: readonly PublicRule[] = [
  { path: '/api/health' },
  { path: '/api/contact', methods: ['POST'] },
  { path: '/api/orders', methods: ['POST'] },
  { path: '/api/cookie-consent' },
  { path: '/api/telegram/webhook', prefix: true },
  { path: '/api/catalog', methods: ['GET'] },
  { path: '/api/catalog/lookup', methods: ['POST'] },
];

const STATE_CHANGING = new Set(['POST', 'PUT', 'PATCH', 'DELETE']);

export function isPublicApi(pathname: string, method: string): boolean {
  return PUBLIC_API.some((rule) => {
    const pathOk = rule.prefix
      ? pathname === rule.path || pathname.startsWith(`${rule.path}/`)
      : pathname === rule.path;
    if (!pathOk) return false;
    return !rule.methods || rule.methods.includes(method.toUpperCase());
  });
}

function normalizeOrigin(urlStr: string): { protocol: string; host: string } | null {
  try {
    const u = new URL(urlStr);
    const protocol = u.protocol.toLowerCase();
    const port = u.port || (protocol === 'https:' ? '443' : '80');
    return { protocol, host: `${u.hostname.toLowerCase()}:${port}` };
  } catch {
    return null;
  }
}

/**
 * Same-origin check via Origin (or Referer) comparing scheme, host, and port.
 * Only trusts X-Forwarded-* headers when TRUST_PROXY === 'true'.
 */
export function isSameOrigin(request: NextRequest): boolean {
  const source = request.headers.get('origin') || request.headers.get('referer');
  if (!source) return false;
  const sourceNorm = normalizeOrigin(source);
  if (!sourceNorm) return false;

  const trustProxy = process.env.TRUST_PROXY === 'true';
  const candidates: Array<{ protocol: string; host: string }> = [];

  // 1. SITE_URL if configured
  if (process.env.SITE_URL) {
    const siteNorm = normalizeOrigin(process.env.SITE_URL);
    if (siteNorm) candidates.push(siteNorm);
  }

  // 2. Proxied host & proto ONLY if TRUST_PROXY is enabled
  if (trustProxy) {
    const forwardedHost = request.headers.get('x-forwarded-host');
    const forwardedProto = (request.headers.get('x-forwarded-proto') || 'https').toLowerCase();
    if (forwardedHost) {
      const norm = normalizeOrigin(`${forwardedProto.endsWith(':') ? forwardedProto : forwardedProto + ':'}//${forwardedHost}`);
      if (norm) candidates.push(norm);
    }
  }

  // 3. Direct request host
  const directHost = request.headers.get('host');
  if (directHost) {
    const directProto = request.nextUrl.protocol || 'http:';
    const norm = normalizeOrigin(`${directProto}//${directHost}`);
    if (norm) candidates.push(norm);
  }

  // Match: must match exact scheme and host:port
  return candidates.some((c) => c.protocol === sourceNorm.protocol && c.host === sourceNorm.host);
}

function isAuthorizedCron(request: NextRequest, pathname: string): boolean {
  const cronSecret = process.env.BACKUP_CRON_SECRET;
  if (!cronSecret || !pathname.startsWith('/api/backup')) return false;
  const authHeader = request.headers.get('authorization') || '';
  const backupSecretHeader = request.headers.get('x-backup-secret') || '';
  return authHeader === `Bearer ${cronSecret}` || backupSecretHeader === cronSecret;
}

export function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;
  const method = request.method.toUpperCase();

  const isAdminUi = pathname.startsWith('/admin');
  const isApi = pathname.startsWith('/api/');

  // Pre-parse payload size check on state-changing API requests (both public and protected)
  if (isApi && STATE_CHANGING.has(method)) {
    const contentLength = Number(request.headers.get('content-length') ?? 0);
    const maxBytes = pathname.startsWith('/api/upload') ? 15 * 1024 * 1024 : 2 * 1024 * 1024;
    if (contentLength > maxBytes) {
      return NextResponse.json({ error: 'Payload too large', code: 'payload_too_large' }, { status: 413 });
    }
  }

  const isProtectedApi = isApi && !isPublicApi(pathname, method);

  if (!isAdminUi && !isProtectedApi) {
    return NextResponse.next();
  }

  const cron = isAuthorizedCron(request, pathname);

  const allowlist = getAdminIpAllowlist();
  if (allowlist.length > 0 && !cron) {
    const ip = clientIpFromHeaders(request.headers);
    if (!isIpAllowed(ip, allowlist)) {
      if (isProtectedApi) {
        return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
      }
      return new NextResponse('Admin access denied from this IP', {
        status: 403,
        headers: { 'Content-Type': 'text/plain; charset=utf-8' },
      });
    }
  }

  if (isProtectedApi) {
    if (STATE_CHANGING.has(method) && !cron && process.env.ADMIN_CSRF_CHECK !== 'false' && !isSameOrigin(request)) {
      return NextResponse.json({ error: 'Bad origin', code: 'bad_origin' }, { status: 403 });
    }
    return NextResponse.next();
  }

  if (pathname === '/admin/login' || pathname.startsWith('/admin/login/')) {
    // Never let a client-supplied x-admin-pathname reach the admin layout.
    const loginHeaders = new Headers(request.headers);
    loginHeaders.delete('x-admin-pathname');
    return NextResponse.next({ request: { headers: loginHeaders } });
  }

  const session = request.cookies.get(SESSION_COOKIE)?.value;
  if (!session) {
    const loginUrl = new URL('/admin/login', request.url);
    if (isKnownAdminPath(pathname)) {
      loginUrl.searchParams.set('from', pathname);
    }
    return NextResponse.redirect(loginUrl);
  }

  const requestHeaders = new Headers(request.headers);
  requestHeaders.set('x-admin-pathname', pathname);

  return NextResponse.next({
    request: { headers: requestHeaders },
  });
}

export const config = {
  matcher: ['/admin/:path*', '/api/:path*'],
};
