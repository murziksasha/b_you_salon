import { promises as fs } from 'fs';
import path from 'path';
import { createId } from './id';
import { optimizeImageUpload } from './image-optimize';
import { atomicWriteFile } from './atomic-write';
import { upsertMediaMeta } from './media-index';
import { isMediaPurpose, type MediaPurpose } from './media-purpose';
import { uploadsDir } from './uploads-path';

const MAX_REMOTE_IMAGE_SIZE = 10 * 1024 * 1024; // 10 MB
const FETCH_TIMEOUT_MS = 15_000;

/**
 * Fetch a remote image URL, optimize it, save to /uploads/, index it.
 * Returns the local URL path (`/uploads/filename.webp`) or null on failure.
 */
export async function fetchAndStoreImage(remoteUrl: string, purpose: MediaPurpose = 'product'): Promise<string | null> {
  if (!remoteUrl || !remoteUrl.startsWith('http')) return null;

  let buffer: Buffer;
  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
    const res = await fetch(remoteUrl, { signal: controller.signal });
    clearTimeout(timer);
    if (!res.ok) return null;

    const contentLength = Number(res.headers.get('content-length') ?? 0);
    if (contentLength > MAX_REMOTE_IMAGE_SIZE) return null;

    const ab = await res.arrayBuffer();
    buffer = Buffer.from(ab);
    if (buffer.byteLength > MAX_REMOTE_IMAGE_SIZE) return null;
  } catch {
    return null;
  }

  // Detect extension from URL
  const rawExt = path.extname(new URL(remoteUrl).pathname).toLowerCase();
  const declaredExt = rawExt === '.jpeg' ? '.jpg' : rawExt || '.jpg';

  let optimized: Awaited<ReturnType<typeof optimizeImageUpload>>;
  try {
    optimized = await optimizeImageUpload(buffer, declaredExt, { preset: 'product' });
  } catch {
    return null;
  }

  const safeName = `${Date.now()}-${createId()}${optimized.ext}`;
  const dir = uploadsDir();

  try {
    await fs.mkdir(dir, { recursive: true });
    await atomicWriteFile(path.join(dir, safeName), optimized.buffer);
  } catch {
    return null;
  }

  const resolvedPurpose: MediaPurpose = isMediaPurpose(purpose) ? purpose : 'product';
  const url = `/uploads/${safeName}`;
  await upsertMediaMeta({
    name: safeName,
    url,
    purpose: resolvedPurpose,
    tags: ['import'],
    folderId: '',
    width: optimized.width,
    height: optimized.height,
    kind: 'image',
  }).catch(() => {
    // non-fatal — media index can be repaired manually
  });

  return url;
}
