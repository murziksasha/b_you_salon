import { NextRequest, NextResponse } from 'next/server';
import { getSession, getSessionClaims } from '@/lib/auth';
import { assertAdminIp } from '@/lib/require-admin-ip';
import { getPageRevision, listPageRevisions, savePageRevision } from '@/lib/revisions';
import { getSiteData, saveSiteData } from '@/lib/site-data';
import { appendActivity } from '@/lib/admin-activity';

export const dynamic = 'force-dynamic';

async function guard() {
  const ipGate = await assertAdminIp();
  if (!ipGate.ok) {
    return { ok: false as const, response: NextResponse.json({ error: ipGate.error }, { status: ipGate.status }) };
  }
  if (!(await getSession())) {
    return { ok: false as const, response: NextResponse.json({ error: 'Unauthorized' }, { status: 401 }) };
  }
  return { ok: true as const };
}

export async function GET(request: NextRequest) {
  const g = await guard();
  if (!g.ok) return g.response;

  const pageId = request.nextUrl.searchParams.get('pageId') || '';
  const revId = request.nextUrl.searchParams.get('revId') || '';
  if (!pageId) {
    return NextResponse.json({ error: 'Missing pageId' }, { status: 400 });
  }
  if (revId) {
    const rev = await getPageRevision(pageId, revId);
    if (!rev) return NextResponse.json({ error: 'Not found' }, { status: 404 });
    return NextResponse.json({ revision: rev });
  }
  const revisions = await listPageRevisions(pageId);
  return NextResponse.json({ revisions });
}

/** Snapshot current published page, or restore a revision. */
export async function POST(request: NextRequest) {
  const g = await guard();
  if (!g.ok) return g.response;

  try {
    const body = (await request.json()) as {
      action?: 'snapshot' | 'restore';
      pageId?: string;
      revId?: string;
      label?: string;
    };
    if (!body.pageId) {
      return NextResponse.json({ error: 'Missing pageId' }, { status: 400 });
    }
    const site = await getSiteData();
    const page = site.pages.find((p) => p.id === body.pageId);
    if (!page) return NextResponse.json({ error: 'Page not found' }, { status: 404 });
    const claims = await getSessionClaims();

    if (body.action === 'restore') {
      if (!body.revId) return NextResponse.json({ error: 'Missing revId' }, { status: 400 });
      const rev = await getPageRevision(body.pageId, body.revId);
      if (!rev) return NextResponse.json({ error: 'Revision not found' }, { status: 404 });
      // Snapshot current before restore
      await savePageRevision(page, { actor: claims?.username, label: 'pre-restore' });
      const restored = { ...rev.page, id: page.id, slug: page.slug };
      const pages = site.pages.map((p) => (p.id === page.id ? restored : p));
      const saved = await saveSiteData({ ...site, pages });
      try {
        await appendActivity({
          kind: 'site_restore',
          message: `Відновлено сторінку «${page.title}» з ревізії`,
          actor: claims?.username,
        });
      } catch {
        /* ignore */
      }
      return NextResponse.json({ ok: true, page: restored, updatedAt: saved.updatedAt });
    }

    // default: snapshot
    const meta = await savePageRevision(page, {
      actor: claims?.username,
      label: body.label || 'manual',
    });
    return NextResponse.json({ ok: true, revision: meta });
  } catch {
    return NextResponse.json({ error: 'Bad request' }, { status: 400 });
  }
}
