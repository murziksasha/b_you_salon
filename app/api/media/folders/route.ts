import { NextRequest, NextResponse } from 'next/server';
import { getSession } from '@/lib/auth';
import { assertAdminIp } from '@/lib/require-admin-ip';
import { clientKey, rateLimit } from '@/lib/rate-limit';
import {
  createMediaFolder,
  deleteMediaFolder,
  listMediaFolders,
  patchMediaFolder,
  reorderMediaFolders,
} from '@/lib/media-index';
import { listFoldersWithCounts } from '@/lib/media';

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

export async function GET() {
  const g = await guard();
  if (!g.ok) return g.response;
  const folders = await listFoldersWithCounts();
  return NextResponse.json({ folders });
}

export async function POST(request: NextRequest) {
  const g = await guard();
  if (!g.ok) return g.response;

  const rl = rateLimit(clientKey(request, 'media-folders'), { limit: 30, windowMs: 60_000 });
  if (!rl.allowed) {
    const retryAfter = Math.ceil(rl.retryAfterMs / 1000) || 60;
    return NextResponse.json(
      { error: 'Too many requests', retryAfter },
      { status: 429, headers: { 'Retry-After': String(retryAfter) } },
    );
  }

  try {
    const body = (await request.json()) as { label?: string };
    if (!body.label || typeof body.label !== 'string' || !body.label.trim()) {
      return NextResponse.json({ error: 'Missing label' }, { status: 400 });
    }
    const folder = await createMediaFolder(body.label);
    return NextResponse.json({ ok: true, folder });
  } catch {
    return NextResponse.json({ error: 'Failed to create folder' }, { status: 500 });
  }
}

export async function PATCH(request: NextRequest) {
  const g = await guard();
  if (!g.ok) return g.response;

  const rl = rateLimit(clientKey(request, 'media-folders-patch'), { limit: 40, windowMs: 60_000 });
  if (!rl.allowed) {
    const retryAfter = Math.ceil(rl.retryAfterMs / 1000) || 60;
    return NextResponse.json(
      { error: 'Too many requests', retryAfter },
      { status: 429, headers: { 'Retry-After': String(retryAfter) } },
    );
  }

  try {
    const body = (await request.json()) as {
      id?: string;
      label?: string;
      sortOrder?: number;
      orderedIds?: string[];
    };

    if (Array.isArray(body.orderedIds)) {
      const ids = body.orderedIds.filter((id): id is string => typeof id === 'string');
      const folders = await reorderMediaFolders(ids);
      return NextResponse.json({ ok: true, folders });
    }

    if (!body.id || typeof body.id !== 'string') {
      return NextResponse.json({ error: 'Missing id' }, { status: 400 });
    }
    const folder = await patchMediaFolder(body.id, {
      label: typeof body.label === 'string' ? body.label : undefined,
      sortOrder:
        typeof body.sortOrder === 'number' && Number.isFinite(body.sortOrder)
          ? body.sortOrder
          : undefined,
    });
    if (!folder) {
      return NextResponse.json({ error: 'Not found' }, { status: 404 });
    }
    return NextResponse.json({ ok: true, folder });
  } catch {
    return NextResponse.json({ error: 'Bad request' }, { status: 400 });
  }
}

export async function DELETE(request: NextRequest) {
  const g = await guard();
  if (!g.ok) return g.response;

  const rl = rateLimit(clientKey(request, 'media-folders-delete'), { limit: 20, windowMs: 60_000 });
  if (!rl.allowed) {
    const retryAfter = Math.ceil(rl.retryAfterMs / 1000) || 60;
    return NextResponse.json(
      { error: 'Too many requests', retryAfter },
      { status: 429, headers: { 'Retry-After': String(retryAfter) } },
    );
  }

  try {
    const body = (await request.json()) as { id?: string };
    if (!body.id || typeof body.id !== 'string') {
      return NextResponse.json({ error: 'Missing id' }, { status: 400 });
    }
    const ok = await deleteMediaFolder(body.id);
    if (!ok) {
      return NextResponse.json({ error: 'Not found' }, { status: 404 });
    }
    const folders = await listMediaFolders();
    return NextResponse.json({ ok: true, folders });
  } catch {
    return NextResponse.json({ error: 'Bad request' }, { status: 400 });
  }
}
