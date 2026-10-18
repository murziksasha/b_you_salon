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
];

const STATE_CHANGING = new Set(['POST', 'PUT', 'PATCH', 'DELETE']);

export function isPublicApi(pathname: string, method: string): boolean {
  return PUBLIC_API.some(rule => {
    const pathOk = rule.prefix
      ? pathname === rule.path || pathname.startsWith(`${rule.path}/`)
      : pathname === rule.path;
    if (!pathOk) return false;
    return !rule.methods || rule.methods.includes(method.toUpperCase());
  });
}

function hostnameOf(hostHeader: string): string {
  // Strip port (nginx `proxy_set_header Host $host` drops it); keep IPv6 brackets intact.
  return hostHeader.replace(/:\d+$/, '').toLowerCase();
}

/**
 * Same-origin check via Origin (or Referer) vs Host / X-Forwarded-Host / SITE_URL.
 * Compares hostnames (ports ignored) because reverse proxies often drop the port from Host.
 */
export function isSameOrigin(request: NextRequest): boolean {
  const source = request.headers.get('origin') || request.headers.get('referer');
  if (!source) return false;
  let sourceHost: string;
  try {
    sourceHost = new URL(source).hostname.toLowerCase();
  } catch {
    return false;
  }
  const candidates = [request.headers.get('x-forwarded-host'), request.headers.get('host')];
  try {
    if (process.env.SITE_URL) candidates.push(new URL(process.env.SITE_URL).host);
  } catch {
    /* ignore bad SITE_URL */
  }
  return candidates.some(h => Boolean(h) && hostnameOf(h as string) === sourceHost);
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
    // Skip typos like /admin/l — otherwise login returns to public 404 shell.
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
