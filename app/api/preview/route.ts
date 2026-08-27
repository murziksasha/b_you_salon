import { NextRequest, NextResponse } from 'next/server';
import { promises as fs } from 'fs';
import path from 'path';
import { requireAdminRole } from '@/lib/require-role';
import { atomicWriteJson } from '@/lib/atomic-write';
import { createId } from '@/lib/id';
import type { Page } from '@/lib/types';

export const dynamic = 'force-dynamic';

function dataRoot(): string {
  return process.env.DATA_DIR || path.join(process.cwd(), 'data');
}

function previewDir(): string {
  return path.join(dataRoot(), 'previews');
}

/**
 * Store ephemeral page draft for iframe preview without publishing.
 * POST { page: Page } → { token, path }
 * GET ?token= → { page }
 */
export async function POST(request: NextRequest) {
  const g = await requireAdminRole('content');
  if (!g.ok) return g.response;

  try {
    const body = (await request.json()) as { page?: Page };
    if (!body.page || !body.page.id) {
      return NextResponse.json({ error: 'Missing page' }, { status: 400 });
    }
    const token = createId();
    const dir = previewDir();
    await fs.mkdir(dir, { recursive: true });
    const file = path.join(dir, `${token}.json`);
    await atomicWriteJson(file, {
      page: body.page,
      createdAt: new Date().toISOString(),
      actor: g.username,
    });

    // Best-effort cleanup of previews older than 2h
    try {
      const names = await fs.readdir(dir);
      const now = Date.now();
      for (const name of names) {
        if (!name.endsWith('.json')) continue;
        const full = path.join(dir, name);
        const st = await fs.stat(full);
        if (now - st.mtimeMs > 2 * 60 * 60 * 1000) {
          await fs.unlink(full).catch(() => {});
        }
      }
    } catch {
      /* ignore */
    }

    return NextResponse.json({
      ok: true,
      token,
      path: `/admin/preview/${token}`,
    });
  } catch {
    return NextResponse.json({ error: 'Bad request' }, { status: 400 });
  }
}

export async function GET(request: NextRequest) {
  const g = await requireAdminRole('content');
  if (!g.ok) return g.response;

  const token = (request.nextUrl.searchParams.get('token') || '').replace(/[^a-zA-Z0-9_-]/g, '');
  if (!token) {
    return NextResponse.json({ error: 'Missing token' }, { status: 400 });
  }
  try {
    const raw = await fs.readFile(path.join(previewDir(), `${token}.json`), 'utf-8');
    const parsed = JSON.parse(raw) as { page: Page };
    return NextResponse.json({ page: parsed.page });
  } catch {
    return NextResponse.json({ error: 'Not found' }, { status: 404 });
  }
}
