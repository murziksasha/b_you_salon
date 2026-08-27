import { promises as fs } from 'fs';
import path from 'path';
import { NextRequest, NextResponse } from 'next/server';
import { getSession } from '@/lib/auth';
import { createId } from '@/lib/id';
import { optimizeImageUpload } from '@/lib/image-optimize';
import { isImagePresetId } from '@/lib/image-presets';
import { upsertMediaMeta, type MediaKind } from '@/lib/media-index';
import { isMediaPurpose, purposeFromPreset } from '@/lib/media-purpose';
import { assertAdminIp } from '@/lib/require-admin-ip';
import { clientKey, rateLimit } from '@/lib/rate-limit';
import { atomicWriteFile } from '@/lib/atomic-write';
import { uploadsDir } from '@/lib/uploads-path';
import { isSafeUploadName } from '@/lib/media-name';

const IMAGE_TYPES = new Set(['image/jpeg', 'image/png', 'image/webp', 'image/gif']);
const VIDEO_TYPES = new Set(['video/mp4', 'video/webm', 'video/quicktime']);
const IMAGE_EXT = new Set(['.jpg', '.jpeg', '.png', '.webp', '.gif']);
const VIDEO_EXT = new Set(['.mp4', '.webm', '.mov']);
const MAX_IMAGE_SIZE = 5 * 1024 * 1024;
const MAX_VIDEO_SIZE = 80 * 1024 * 1024;

const IMAGE_MAGIC: Array<{ ext: string; bytes: number[] }> = [
  { ext: '.jpg', bytes: [0xff, 0xd8, 0xff] },
  { ext: '.png', bytes: [0x89, 0x50, 0x4e, 0x47] },
  { ext: '.gif', bytes: [0x47, 0x49, 0x46] },
  { ext: '.webp', bytes: [0x52, 0x49, 0x46, 0x46] }, // RIFF....WEBP
];

function detectImageExt(buffer: Buffer, declaredExt: string): string | null {
  for (const m of IMAGE_MAGIC) {
    if (m.bytes.every((b, i) => buffer[i] === b)) {
      if (m.ext === '.webp') {
        if (buffer.toString('ascii', 8, 12) !== 'WEBP') continue;
      }
      return m.ext === '.jpg' ? '.jpg' : m.ext;
    }
  }
  if (IMAGE_EXT.has(declaredExt)) return declaredExt === '.jpeg' ? '.jpg' : declaredExt;
  return null;
}

/** Best-effort video container sniff (not a full parser). */
function detectVideoExt(buffer: Buffer, declaredExt: string): string | null {
  if (buffer.length >= 12) {
    // ISO BMFF (mp4/mov): size(4) + 'ftyp'
    const box = buffer.toString('ascii', 4, 8);
    if (box === 'ftyp') {
      const brand = buffer.toString('ascii', 8, 12);
      if (declaredExt === '.mov' || brand === 'qt  ') return '.mov';
      return '.mp4';
    }
    // WebM / Matroska EBML header
    if (buffer[0] === 0x1a && buffer[1] === 0x45 && buffer[2] === 0xdf && buffer[3] === 0xa3) {
      return '.webm';
    }
  }
  if (VIDEO_EXT.has(declaredExt)) return declaredExt;
  return null;
}

export async function POST(request: NextRequest) {
  const ipGate = await assertAdminIp();
  if (!ipGate.ok) {
    return NextResponse.json({ error: ipGate.error }, { status: ipGate.status });
  }

  const isAuthenticated = await getSession();
  if (!isAuthenticated) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const rl = rateLimit(clientKey(request, 'upload'), { limit: 20, windowMs: 60_000 });
  if (!rl.allowed) {
    const retryAfter = Math.ceil(rl.retryAfterMs / 1000) || 60;
    return NextResponse.json(
      { error: 'Too many uploads', retryAfter },
      { status: 429, headers: { 'Retry-After': String(retryAfter) } },
    );
  }

  try {
    const formData = await request.formData();
    const file = formData.get('file');

    if (!file || !(file instanceof File)) {
      return NextResponse.json({ error: 'No file provided' }, { status: 400 });
    }

    const extLower = path.extname(file.name).toLowerCase();
    const forceVideo =
      VIDEO_TYPES.has(file.type) ||
      (!IMAGE_TYPES.has(file.type) && VIDEO_EXT.has(extLower));
    const isImage =
      IMAGE_TYPES.has(file.type) || (!forceVideo && IMAGE_EXT.has(extLower));

    if (!forceVideo && !isImage) {
      return NextResponse.json({ error: 'Invalid file type' }, { status: 400 });
    }

    const mediaKind: MediaKind = forceVideo ? 'video' : 'image';

    const maxSize = mediaKind === 'video' ? MAX_VIDEO_SIZE : MAX_IMAGE_SIZE;
    if (file.size > maxSize) {
      return NextResponse.json(
        {
          error:
            mediaKind === 'video'
              ? 'Video too large (max 80 MB)'
              : 'File too large (max 5 MB)',
        },
        { status: 400 },
      );
    }

    const presetRaw = String(formData.get('preset') || '').trim();
    const preset = isImagePresetId(presetRaw) ? presetRaw : undefined;
    const purposeRaw = String(formData.get('purpose') || '').trim();
    const purpose = isMediaPurpose(purposeRaw) ? purposeRaw : purposeFromPreset(preset);
    const folderIdRaw = String(formData.get('folderId') || '').trim();
    const folderId =
      folderIdRaw && folderIdRaw !== 'root' && folderIdRaw !== 'all' ? folderIdRaw : '';
    const tagsRaw = String(formData.get('tags') || '').trim();
    const tags = tagsRaw
      ? tagsRaw
          .split(/[,;]+/)
          .map((t) => t.trim())
          .filter(Boolean)
      : [];
    const maxWidthRaw = formData.get('maxWidth');
    const maxHeightRaw = formData.get('maxHeight');
    const maxWidth =
      maxWidthRaw != null && String(maxWidthRaw).trim() !== ''
        ? Number(maxWidthRaw)
        : undefined;
    const maxHeight =
      maxHeightRaw != null && String(maxHeightRaw).trim() !== ''
        ? Number(maxHeightRaw)
        : undefined;

    const rawExt = path.extname(file.name).toLowerCase();
    const declaredExt = rawExt === '.jpeg' ? '.jpg' : rawExt;

    const buffer = Buffer.from(await file.arrayBuffer());
    const dir = uploadsDir();
    await fs.mkdir(dir, { recursive: true });

    if (mediaKind === 'video') {
      const safeExt = detectVideoExt(buffer, declaredExt);
      if (!safeExt || !VIDEO_EXT.has(safeExt)) {
        return NextResponse.json({ error: 'Invalid video content' }, { status: 400 });
      }
      const safeName = `${Date.now()}-${createId()}${safeExt}`;
      await atomicWriteFile(path.join(dir, safeName), buffer);
      const url = `/uploads/${safeName}`;
      await upsertMediaMeta({
        name: safeName,
        url,
        purpose,
        tags,
        folderId,
        kind: 'video',
      });
      return NextResponse.json({
        url,
        kind: 'video',
        contentType:
          safeExt === '.webm' ? 'video/webm' : safeExt === '.mov' ? 'video/quicktime' : 'video/mp4',
        purpose,
        tags,
        folderId,
      });
    }

    const safeExt = detectImageExt(buffer, declaredExt);
    if (!safeExt || !IMAGE_EXT.has(safeExt)) {
      return NextResponse.json({ error: 'Invalid image content' }, { status: 400 });
    }

    const optimized = await optimizeImageUpload(buffer, safeExt, {
      preset,
      maxWidth: Number.isFinite(maxWidth) ? maxWidth : undefined,
      maxHeight: Number.isFinite(maxHeight) ? maxHeight : undefined,
    });

    // Replace-in-place: keep same filename/URL so all site references stay valid.
    const replaceRaw = String(formData.get('replaceName') || '').trim();
    let safeName: string;
    if (replaceRaw && isSafeUploadName(replaceRaw)) {
      const replaceExt = path.extname(replaceRaw).toLowerCase();
      // Only replace when optimized format matches existing extension family
      if (replaceExt === optimized.ext || (replaceExt === '.jpg' && optimized.ext === '.jpg')) {
        safeName = replaceRaw;
      } else {
        // Overwrite bytes under original name even if format differs — browsers follow content-type from route
        safeName = replaceRaw;
      }
    } else {
      safeName = `${Date.now()}-${createId()}${optimized.ext}`;
    }

    await atomicWriteFile(path.join(dir, safeName), optimized.buffer);

    const url = `/uploads/${safeName}`;
    await upsertMediaMeta({
      name: safeName,
      url,
      purpose,
      tags,
      folderId,
      width: optimized.width,
      height: optimized.height,
      kind: 'image',
    });

    return NextResponse.json({
      url,
      kind: 'image',
      optimized: optimized.optimized,
      contentType: optimized.contentType,
      width: optimized.width,
      height: optimized.height,
      preset: preset || 'default',
      purpose,
      tags,
      folderId,
    });
  } catch {
    return NextResponse.json({ error: 'Upload failed' }, { status: 500 });
  }
}
