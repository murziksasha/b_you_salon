import { NextRequest, NextResponse } from 'next/server';
import { clientKey, rateLimit } from '@/lib/rate-limit';
import { requireAdminRole } from '@/lib/require-role';
import {
  deleteUpload,
  folderCounts,
  listFoldersWithCounts,
  listUploads,
} from '@/lib/media';
import {
  isMediaKind,
  moveMediaToFolder,
  patchMediaMeta,
  reorderMediaItems,
} from '@/lib/media-index';
import { isMediaPurpose } from '@/lib/media-purpose';
import {
  collectSiteMediaUsages,
  formatUsageTooltip,
  getUsageForUploadName,
} from '@/lib/media-usage';
import { getSiteData } from '@/lib/site-data';

export const dynamic = 'force-dynamic';

async function guard() {
  return requireAdminRole('media');
}

function parseSort(raw: string | null): 'manual' | 'mtime' | 'name' {
  if (raw === 'manual' || raw === 'name' || raw === 'mtime') return raw;
  return 'mtime';
}

export async function GET(request: NextRequest) {
  const g = await guard();
  if (!g.ok) return g.response;

  const purposeRaw = request.nextUrl.searchParams.get('purpose') || '';
  const purpose =
    purposeRaw && purposeRaw !== 'all' && isMediaPurpose(purposeRaw) ? purposeRaw : undefined;
  const kindRaw = request.nextUrl.searchParams.get('kind') || '';
  const kind =
    kindRaw && kindRaw !== 'all' && isMediaKind(kindRaw) ? kindRaw : undefined;
  const q = request.nextUrl.searchParams.get('q') || undefined;
  const tag = request.nextUrl.searchParams.get('tag') || undefined;
  const folderRaw = request.nextUrl.searchParams.get('folder');
  const folder =
    folderRaw === null || folderRaw === '' || folderRaw === 'all'
      ? 'all'
      : folderRaw === 'root' || folderRaw === '__root'
        ? 'root'
        : folderRaw;
  const sort = parseSort(request.nextUrl.searchParams.get('sort'));
  const withUsage = request.nextUrl.searchParams.get('usage') === '1';

  const [items, folders, counts, site] = await Promise.all([
    listUploads({ purpose, kind, q, tag, folder, sort }),
    listFoldersWithCounts(),
    folderCounts(),
    withUsage ? getSiteData() : Promise.resolve(null),
  ]);

  const usageMap = site ? collectSiteMediaUsages(site) : null;

  return NextResponse.json({
    items: items.map((item) => {
      if (!usageMap) return item;
      const refs = usageMap.get(item.url)?.refs || usageMap.get(`/uploads/${item.name}`)?.refs || [];
      return {
        ...item,
        usedBy: refs,
        usageTooltip: refs.length ? formatUsageTooltip(refs) : '',
      };
    }),
    folders,
    counts: {
      all: counts.all || 0,
      root: counts.root || 0,
    },
    count: items.length,
    bytes: items.reduce((s, i) => s + i.size, 0),
    sort,
    folder,
  });
}

export async function PATCH(request: NextRequest) {
  const g = await guard();
  if (!g.ok) return g.response;

  const rl = rateLimit(clientKey(request, 'media-patch'), { limit: 60, windowMs: 60_000 });
  if (!rl.allowed) {
    const retryAfter = Math.ceil(rl.retryAfterMs / 1000) || 60;
    return NextResponse.json(
      { error: 'Too many requests', retryAfter },
      { status: 429, headers: { 'Retry-After': String(retryAfter) } },
    );
  }

  try {
    const body = (await request.json()) as {
      name?: string;
      names?: string[];
      purpose?: string;
      tags?: string[] | string;
      alt?: string;
      focusX?: number;
      focusY?: number;
      folderId?: string;
      sortOrder?: number;
      /** Bulk reorder within a folder */
      orderedNames?: string[];
      reorderFolderId?: string;
    };

    if (Array.isArray(body.orderedNames)) {
      const names = body.orderedNames.filter((n): n is string => typeof n === 'string');
      const folderId =
        typeof body.reorderFolderId === 'string' ? body.reorderFolderId : body.folderId || '';
      const updated = await reorderMediaItems(folderId === 'root' ? '' : folderId, names);
      return NextResponse.json({ ok: true, items: updated });
    }

    // Bulk move into a virtual folder (or root)
    if (Array.isArray(body.names) && body.folderId !== undefined) {
      const names = body.names.filter((n): n is string => typeof n === 'string' && n.trim() !== '');
      if (names.length === 0) {
        return NextResponse.json({ error: 'Missing names' }, { status: 400 });
      }
      const folderId =
        body.folderId === 'root' || body.folderId === '__root' ? '' : body.folderId;
      const result = await moveMediaToFolder(names, folderId);
      return NextResponse.json({ ok: true, ...result });
    }

    if (!body.name || typeof body.name !== 'string') {
      return NextResponse.json({ error: 'Missing name' }, { status: 400 });
    }
    const purpose =
      body.purpose && isMediaPurpose(body.purpose) ? body.purpose : undefined;
    let tags: string[] | undefined;
    if (Array.isArray(body.tags)) {
      tags = body.tags.filter((t): t is string => typeof t === 'string').map((t) => t.trim()).filter(Boolean);
    } else if (typeof body.tags === 'string') {
      tags = body.tags
        .split(/[,;]+/)
        .map((t) => t.trim())
        .filter(Boolean);
    }
    let folderId: string | undefined;
    if (body.folderId !== undefined) {
      folderId = body.folderId === 'root' || body.folderId === '__root' ? '' : body.folderId;
    }
    const meta = await patchMediaMeta(body.name, {
      purpose,
      tags,
      alt: typeof body.alt === 'string' ? body.alt : undefined,
      focusX: typeof body.focusX === 'number' ? body.focusX : undefined,
      focusY: typeof body.focusY === 'number' ? body.focusY : undefined,
      folderId,
      sortOrder:
        typeof body.sortOrder === 'number' && Number.isFinite(body.sortOrder)
          ? body.sortOrder
          : undefined,
    });
    if (!meta) {
      return NextResponse.json({ error: 'Not found' }, { status: 404 });
    }
    return NextResponse.json({ ok: true, item: meta });
  } catch {
    return NextResponse.json({ error: 'Bad request' }, { status: 400 });
  }
}

export async function DELETE(request: NextRequest) {
  const g = await guard();
  if (!g.ok) return g.response;

  const rl = rateLimit(clientKey(request, 'media-delete'), { limit: 40, windowMs: 60_000 });
  if (!rl.allowed) {
    const retryAfter = Math.ceil(rl.retryAfterMs / 1000) || 60;
    return NextResponse.json(
      { error: 'Too many requests', retryAfter },
      { status: 429, headers: { 'Retry-After': String(retryAfter) } },
    );
  }

  try {
    const body = (await request.json()) as { name?: string; force?: boolean };
    if (!body.name || typeof body.name !== 'string') {
      return NextResponse.json({ error: 'Missing name' }, { status: 400 });
    }

    // Block delete when site still references this upload (no force by default).
    if (!body.force) {
      const site = await getSiteData();
      const refs = getUsageForUploadName(site, body.name);
      if (refs.length > 0) {
        return NextResponse.json(
          {
            error: 'in_use',
            message: formatUsageTooltip(refs),
            refs,
          },
          { status: 409 },
        );
      }
    }

    const ok = await deleteUpload(body.name);
    if (!ok) {
      return NextResponse.json({ error: 'Not found or invalid name' }, { status: 404 });
    }
    return NextResponse.json({ ok: true });
  } catch {
    return NextResponse.json({ error: 'Bad request' }, { status: 400 });
  }
}
