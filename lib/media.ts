import { promises as fs } from 'fs';
import path from 'path';
import {
  listMediaFolders,
  mediaKindFromName,
  readMediaIndex,
  removeMediaMeta,
  type MediaKind,
  type MediaListItem,
  type MediaSortMode,
} from './media-index';
import type { MediaPurpose } from './media-purpose';
import { isSafeUploadName } from './media-name';
import { uploadsDir as resolveUploadsDir } from './uploads-path';

export type { MediaListItem };
export { isSafeUploadName };

/** @deprecated use MediaListItem — kept alias for callers */
export type MediaItem = MediaListItem;

export function uploadsDir(): string {
  return resolveUploadsDir();
}

export type ListUploadsOptions = {
  purpose?: MediaPurpose | 'all';
  kind?: MediaKind | 'all';
  q?: string;
  tag?: string;
  /** 'all' | 'root' (uncategorized) | folder id */
  folder?: string | 'all' | 'root';
  sort?: MediaSortMode;
};

export async function listUploads(options?: ListUploadsOptions): Promise<MediaListItem[]> {
  const dir = uploadsDir();
  const index = await readMediaIndex();
  const byName = new Map(index.items.map((i) => [i.name, i]));

  let diskNames: string[] = [];
  try {
    diskNames = await fs.readdir(dir);
  } catch {
    diskNames = [];
  }

  const items: MediaListItem[] = [];
  for (const name of diskNames) {
    if (name.startsWith('.')) continue;
    if (!isSafeUploadName(name)) continue;
    const full = path.join(dir, name);
    let stat;
    try {
      stat = await fs.stat(full);
    } catch {
      continue;
    }
    if (!stat.isFile()) continue;
    const meta = byName.get(name);
    items.push({
      name,
      url: `/uploads/${name}`,
      size: stat.size,
      mtime: stat.mtime.toISOString(),
      purpose: meta?.purpose || 'other',
      kind: meta?.kind || mediaKindFromName(name),
      tags: meta?.tags || [],
      folderId: meta?.folderId || '',
      sortOrder: meta?.sortOrder ?? 0,
      alt: meta?.alt,
      focusX: meta?.focusX,
      focusY: meta?.focusY,
      width: meta?.width,
      height: meta?.height,
    });
  }

  const purpose = options?.purpose && options.purpose !== 'all' ? options.purpose : null;
  const kind = options?.kind && options.kind !== 'all' ? options.kind : null;
  const q = options?.q?.trim().toLowerCase() || '';
  const tag = options?.tag?.trim().toLowerCase() || '';
  const folder = options?.folder ?? 'all';
  const sort: MediaSortMode = options?.sort || 'mtime';

  const filtered = items.filter((item) => {
    if (purpose && item.purpose !== purpose) return false;
    if (kind && item.kind !== kind) return false;
    if (folder === 'root') {
      if (item.folderId) return false;
    } else if (folder && folder !== 'all') {
      if (item.folderId !== folder) return false;
    }
    if (tag && !item.tags.some((t) => t.toLowerCase() === tag || t.toLowerCase().includes(tag))) {
      return false;
    }
    if (q) {
      const hay = `${item.name} ${item.tags.join(' ')} ${item.alt || ''}`.toLowerCase();
      if (!hay.includes(q)) return false;
    }
    return true;
  });

  filtered.sort((a, b) => {
    if (sort === 'name') {
      return a.name.localeCompare(b.name, 'uk');
    }
    if (sort === 'manual') {
      if (a.sortOrder !== b.sortOrder) return a.sortOrder - b.sortOrder;
      return a.mtime < b.mtime ? 1 : -1;
    }
    // mtime newest first
    return a.mtime < b.mtime ? 1 : -1;
  });

  return filtered;
}

export async function folderCounts(): Promise<Record<string, number>> {
  const dir = uploadsDir();
  const index = await readMediaIndex();
  const byName = new Map(index.items.map((i) => [i.name, i]));
  const counts: Record<string, number> = { root: 0, all: 0 };

  let diskNames: string[] = [];
  try {
    diskNames = await fs.readdir(dir);
  } catch {
    return counts;
  }

  for (const name of diskNames) {
    if (name.startsWith('.') || !isSafeUploadName(name)) continue;
    try {
      const st = await fs.stat(path.join(dir, name));
      if (!st.isFile()) continue;
    } catch {
      continue;
    }
    counts.all = (counts.all || 0) + 1;
    const fid = byName.get(name)?.folderId || '';
    if (!fid) {
      counts.root += 1;
    } else {
      counts[fid] = (counts[fid] || 0) + 1;
    }
  }
  return counts;
}

export async function listFoldersWithCounts(): Promise<
  Array<{ id: string; label: string; sortOrder: number; count: number }>
> {
  const folders = await listMediaFolders();
  const counts = await folderCounts();
  return folders.map((f) => ({
    ...f,
    count: counts[f.id] || 0,
  }));
}

export async function deleteUpload(name: string): Promise<boolean> {
  if (!isSafeUploadName(name)) return false;
  try {
    await fs.unlink(path.join(uploadsDir(), name));
    await removeMediaMeta(name);
    return true;
  } catch {
    return false;
  }
}

export async function uploadsStats(): Promise<{ count: number; bytes: number }> {
  const items = await listUploads();
  return {
    count: items.length,
    bytes: items.reduce((sum, i) => sum + i.size, 0),
  };
}
