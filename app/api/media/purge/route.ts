import { NextRequest, NextResponse } from 'next/server';
import { getSession } from '@/lib/auth';
import { assertAdminIp } from '@/lib/require-admin-ip';
import { clientKey, rateLimit } from '@/lib/rate-limit';
import { deleteUpload, isSafeUploadName } from '@/lib/media';
import {
  formatUsageTooltip,
  getUsageForUploadName,
  type MediaRef,
} from '@/lib/media-usage';
import { getSiteData } from '@/lib/site-data';

export const dynamic = 'force-dynamic';

async function guard() {
  const ipGate = await assertAdminIp();
  if (!ipGate.ok) {
    return { ok: false as const, response: NextResponse.json({ error: ipGate.error }, { status: ipGate.status }) };
  }
  const isAuthenticated = await getSession();
  if (!isAuthenticated) {
    return { ok: false as const, response: NextResponse.json({ error: 'Unauthorized' }, { status: 401 }) };
  }
  return { ok: true as const };
}

/**
 * Delete uploads only when they are no longer referenced in site.json.
 * Always re-reads site data server-side (safe after product hard-delete save).
 */
export async function POST(request: NextRequest) {
  const g = await guard();
  if (!g.ok) return g.response;

  const rl = rateLimit(clientKey(request, 'media-purge'), { limit: 20, windowMs: 60_000 });
  if (!rl.allowed) {
    const retryAfter = Math.ceil(rl.retryAfterMs / 1000) || 60;
    return NextResponse.json(
      { error: 'Too many requests', retryAfter },
      { status: 429, headers: { 'Retry-After': String(retryAfter) } },
    );
  }

  try {
    const body = (await request.json()) as { names?: unknown };
    if (!Array.isArray(body.names)) {
      return NextResponse.json({ error: 'Missing names' }, { status: 400 });
    }

    const names = [
      ...new Set(
        body.names.filter((n): n is string => typeof n === 'string' && isSafeUploadName(n)),
      ),
    ].slice(0, 40);

    const site = await getSiteData();
    const deleted: string[] = [];
    const skipped: Array<{ name: string; reason: string; refs: MediaRef[] }> = [];
    const failed: string[] = [];

    for (const name of names) {
      const refs = getUsageForUploadName(site, name);
      if (refs.length > 0) {
        skipped.push({
          name,
          reason: formatUsageTooltip(refs),
          refs,
        });
        continue;
      }
      const ok = await deleteUpload(name);
      if (ok) deleted.push(name);
      else failed.push(name);
    }

    return NextResponse.json({
      ok: true,
      deleted,
      skipped,
      failed,
    });
  } catch {
    return NextResponse.json({ error: 'Bad request' }, { status: 400 });
  }
}
