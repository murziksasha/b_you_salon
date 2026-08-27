import { promises as fs } from 'fs';
import path from 'path';
import { atomicWriteJson } from './atomic-write';
import { createId } from './id';
import {
  isMediaPurpose,
  type MediaPurpose,
} from './media-purpose';
import { projectRoot } from './uploads-path';

/** Empty string = uncategorized root (no virtual folder). */
export type MediaFolderId = string;

export type MediaFolder = {
  id: string;
  label: string;
  sortOrder: number;
};

export type MediaKind = 'image' | 'video';

export type MediaMeta = {
  name: string;
  url: string;
  purpose: MediaPurpose;
  /** Defaults to image for legacy index rows. */
  kind: MediaKind;
  tags: string[];
  /** Virtual folder id; '' = root / uncategorized */
  folderId: string;
  /** Manual order within folder (lower first) */
  sortOrder: number;
  alt?: string;
  /** Focal point 0–100 (object-position %) */
  focusX?: number;
  focusY?: number;
  width?: number;
  height?: number;
  createdAt: string;
  updatedAt: string;
};

export type MediaIndex = {
  version: 2;
  folders: MediaFolder[];
  items: MediaMeta[];
};

export type MediaListItem = {
  name: string;
  url: string;
  size: number;
  mtime: string;
  purpose: MediaPurpose;
  kind: MediaKind;
  tags: string[];
  folderId: string;
  sortOrder: number;
  alt?: string;
  focusX?: number;
  focusY?: number;
  width?: number;
  height?: number;
};

export function isMediaKind(value: string): value is MediaKind {
  return value === 'image' || value === 'video';
}

export function mediaKindFromName(name: string): MediaKind {
  const ext = name.includes('.') ? name.slice(name.lastIndexOf('.')).toLowerCase() : '';
  if (ext === '.mp4' || ext === '.webm' || ext === '.mov') return 'video';
  return 'image';
}

export type MediaSortMode = 'manual' | 'mtime' | 'name';

function getIndexPath(): string {
  if (process.env.DATA_DIR && process.env.DATA_DIR.trim()) {
    return path.join(path.resolve(process.env.DATA_DIR.trim()), 'media-index.json');
  }
  return path.join(projectRoot(), 'data', 'media-index.json');
}

function emptyIndex(): MediaIndex {
  return { version: 2, folders: [], items: [] };
}

const FOLDER_ID_RE = /^[a-z0-9][\w-]{0,63}$/i;

export function isSafeFolderId(id: string): boolean {
  if (!id || id === '__root' || id === 'all') return false;
  return FOLDER_ID_RE.test(id);
}

export function slugifyFolderLabel(label: string): string {
  const base = label
    .trim()
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 40);
  return base || createId();
}

function normalizeFolder(raw: Partial<MediaFolder>): MediaFolder | null {
  if (!raw.id || typeof raw.id !== 'string' || !isSafeFolderId(raw.id)) return null;
  const label =
    typeof raw.label === 'string' && raw.label.trim() ? raw.label.trim().slice(0, 80) : raw.id;
  const sortOrder =
    typeof raw.sortOrder === 'number' && Number.isFinite(raw.sortOrder) ? raw.sortOrder : 0;
  return { id: raw.id, label, sortOrder };
}

function normalizeItem(raw: Partial<MediaMeta> & { name?: string }): MediaMeta | null {
  if (!raw.name || typeof raw.name !== 'string') return null;
  const purpose =
    raw.purpose && isMediaPurpose(raw.purpose) ? raw.purpose : ('other' as MediaPurpose);
  const tags = Array.isArray(raw.tags)
    ? raw.tags
        .filter((t): t is string => typeof t === 'string' && t.trim() !== '')
        .map((t) => t.trim())
    : [];
  const now = new Date().toISOString();
  let folderId = '';
  if (typeof raw.folderId === 'string' && raw.folderId.trim()) {
    folderId = isSafeFolderId(raw.folderId.trim()) ? raw.folderId.trim() : '';
  }
  const sortOrder =
    typeof raw.sortOrder === 'number' && Number.isFinite(raw.sortOrder) ? raw.sortOrder : 0;
  const kind: MediaKind =
    raw.kind && isMediaKind(raw.kind) ? raw.kind : mediaKindFromName(raw.name);
  return {
    name: raw.name,
    url: raw.url && typeof raw.url === 'string' ? raw.url : `/uploads/${raw.name}`,
    purpose,
    kind,
    tags,
    folderId,
    sortOrder,
    alt: typeof raw.alt === 'string' ? raw.alt : undefined,
    focusX:
      typeof raw.focusX === 'number' && Number.isFinite(raw.focusX)
        ? Math.min(100, Math.max(0, raw.focusX))
        : undefined,
    focusY:
      typeof raw.focusY === 'number' && Number.isFinite(raw.focusY)
        ? Math.min(100, Math.max(0, raw.focusY))
        : undefined,
    width: typeof raw.width === 'number' && Number.isFinite(raw.width) ? raw.width : undefined,
    height: typeof raw.height === 'number' && Number.isFinite(raw.height) ? raw.height : undefined,
    createdAt: typeof raw.createdAt === 'string' ? raw.createdAt : now,
    updatedAt: typeof raw.updatedAt === 'string' ? raw.updatedAt : now,
  };
}

export async function readMediaIndex(): Promise<MediaIndex> {
  const filePath = getIndexPath();
  try {
    const raw = await fs.readFile(filePath, 'utf-8');
    const parsed = JSON.parse(raw) as Partial<MediaIndex> & { version?: number };
    const items: MediaMeta[] = [];
    if (Array.isArray(parsed.items)) {
      for (const row of parsed.items) {
        const n = normalizeItem(row as Partial<MediaMeta>);
        if (n) items.push(n);
      }
    }
    const folders: MediaFolder[] = [];
    if (Array.isArray(parsed.folders)) {
      for (const row of parsed.folders) {
        const f = normalizeFolder(row as Partial<MediaFolder>);
        if (f) folders.push(f);
      }
    }
    folders.sort((a, b) => a.sortOrder - b.sortOrder || a.label.localeCompare(b.label, 'uk'));
    // Drop orphan folder refs on items (folder deleted / corrupt)
    const folderIds = new Set(folders.map((f) => f.id));
    for (const item of items) {
      if (item.folderId && !folderIds.has(item.folderId)) {
        item.folderId = '';
      }
    }
    return { version: 2, folders, items };
  } catch {
    return emptyIndex();
  }
}

export async function writeMediaIndex(index: MediaIndex): Promise<void> {
  const filePath = getIndexPath();
  await fs.mkdir(path.dirname(filePath), { recursive: true });
  await atomicWriteJson(filePath, {
    version: 2 as const,
    folders: index.folders,
    items: index.items,
  });
}

export async function listMediaFolders(): Promise<MediaFolder[]> {
  const index = await readMediaIndex();
  return index.folders;
}

export async function createMediaFolder(label: string): Promise<MediaFolder> {
  const index = await readMediaIndex();
  const trimmed = label.trim().slice(0, 80);
  if (!trimmed) throw new Error('Empty label');

  let id = slugifyFolderLabel(trimmed);
  if (!isSafeFolderId(id) || index.folders.some((f) => f.id === id)) {
    id = `${slugifyFolderLabel(trimmed).slice(0, 32)}-${createId().slice(0, 6)}`;
  }
  if (!isSafeFolderId(id)) {
    id = `f-${createId()}`;
  }

  const maxOrder = index.folders.reduce((m, f) => Math.max(m, f.sortOrder), -1);
  const folder: MediaFolder = {
    id,
    label: trimmed,
    sortOrder: maxOrder + 1,
  };
  index.folders.push(folder);
  await writeMediaIndex(index);
  return folder;
}

export async function patchMediaFolder(
  id: string,
  patch: { label?: string; sortOrder?: number },
): Promise<MediaFolder | null> {
  if (!isSafeFolderId(id)) return null;
  const index = await readMediaIndex();
  const existing = index.folders.find((f) => f.id === id);
  if (!existing) return null;
  const next: MediaFolder = {
    ...existing,
    label:
      typeof patch.label === 'string' && patch.label.trim()
        ? patch.label.trim().slice(0, 80)
        : existing.label,
    sortOrder:
      typeof patch.sortOrder === 'number' && Number.isFinite(patch.sortOrder)
        ? patch.sortOrder
        : existing.sortOrder,
  };
  index.folders = index.folders.map((f) => (f.id === id ? next : f));
  await writeMediaIndex(index);
  return next;
}

export async function reorderMediaFolders(orderedIds: string[]): Promise<MediaFolder[]> {
  const index = await readMediaIndex();
  const byId = new Map(index.folders.map((f) => [f.id, f]));
  const next: MediaFolder[] = [];
  let order = 0;
  for (const id of orderedIds) {
    const f = byId.get(id);
    if (!f) continue;
    next.push({ ...f, sortOrder: order++ });
    byId.delete(id);
  }
  // Append any missing
  for (const f of byId.values()) {
    next.push({ ...f, sortOrder: order++ });
  }
  index.folders = next;
  await writeMediaIndex(index);
  return next;
}

/** Delete folder; items move to root (folderId ''). */
export async function deleteMediaFolder(id: string): Promise<boolean> {
  if (!isSafeFolderId(id)) return false;
  const index = await readMediaIndex();
  if (!index.folders.some((f) => f.id === id)) return false;
  index.folders = index.folders.filter((f) => f.id !== id);
  index.items = index.items.map((item) =>
    item.folderId === id
      ? { ...item, folderId: '', updatedAt: new Date().toISOString() }
      : item,
  );
  await writeMediaIndex(index);
  return true;
}

export async function upsertMediaMeta(
  entry: Omit<MediaMeta, 'createdAt' | 'updatedAt' | 'url' | 'folderId' | 'sortOrder' | 'kind'> & {
    url?: string;
    createdAt?: string;
    width?: number;
    height?: number;
    alt?: string;
    folderId?: string;
    sortOrder?: number;
    kind?: MediaKind;
  },
): Promise<MediaMeta> {
  const index = await readMediaIndex();
  const now = new Date().toISOString();
  const existing = index.items.find((i) => i.name === entry.name);
  const folderIds = new Set(index.folders.map((f) => f.id));
  let folderId = existing?.folderId ?? '';
  if (entry.folderId !== undefined) {
    folderId =
      entry.folderId && folderIds.has(entry.folderId) ? entry.folderId : '';
  }

  let sortOrder = existing?.sortOrder ?? 0;
  if (typeof entry.sortOrder === 'number' && Number.isFinite(entry.sortOrder)) {
    sortOrder = entry.sortOrder;
  } else if (!existing) {
    const peers = index.items.filter((i) => i.folderId === folderId);
    sortOrder = peers.reduce((m, i) => Math.max(m, i.sortOrder), -1) + 1;
  }

  const kind: MediaKind =
    entry.kind && isMediaKind(entry.kind)
      ? entry.kind
      : existing?.kind || mediaKindFromName(entry.name);

  const next: MediaMeta = {
    name: entry.name,
    url: entry.url || `/uploads/${entry.name}`,
    purpose: entry.purpose,
    kind,
    tags: entry.tags || [],
    folderId,
    sortOrder,
    alt: entry.alt,
    width: entry.width,
    height: entry.height,
    createdAt: existing?.createdAt || entry.createdAt || now,
    updatedAt: now,
  };
  if (existing) {
    index.items = index.items.map((i) => (i.name === entry.name ? next : i));
  } else {
    index.items.unshift(next);
  }
  await writeMediaIndex(index);
  return next;
}

export async function patchMediaMeta(
  name: string,
  patch: {
    purpose?: MediaPurpose;
    tags?: string[];
    alt?: string;
    focusX?: number;
    focusY?: number;
    folderId?: string;
    sortOrder?: number;
  },
): Promise<MediaMeta | null> {
  const index = await readMediaIndex();
  const existing = index.items.find((i) => i.name === name);
  const folderIds = new Set(index.folders.map((f) => f.id));

  if (!existing) {
    if (
      !patch.purpose &&
      patch.tags === undefined &&
      patch.alt === undefined &&
      patch.folderId === undefined &&
      patch.sortOrder === undefined
    ) {
      return null;
    }
    return upsertMediaMeta({
      name,
      purpose: patch.purpose || 'other',
      tags: patch.tags || [],
      alt: patch.alt,
      folderId: patch.folderId,
      sortOrder: patch.sortOrder,
    });
  }

  let folderId = existing.folderId;
  if (patch.folderId !== undefined) {
    folderId =
      patch.folderId === '' || !patch.folderId
        ? ''
        : folderIds.has(patch.folderId)
          ? patch.folderId
          : existing.folderId;
  }

  const clampFocus = (v: number | undefined, fallback?: number) => {
    if (v === undefined) return fallback;
    if (!Number.isFinite(v)) return fallback;
    return Math.min(100, Math.max(0, v));
  };

  const next: MediaMeta = {
    ...existing,
    purpose: patch.purpose && isMediaPurpose(patch.purpose) ? patch.purpose : existing.purpose,
    tags: patch.tags !== undefined ? patch.tags : existing.tags,
    alt: patch.alt !== undefined ? patch.alt : existing.alt,
    focusX: clampFocus(patch.focusX, existing.focusX),
    focusY: clampFocus(patch.focusY, existing.focusY),
    folderId,
    sortOrder:
      typeof patch.sortOrder === 'number' && Number.isFinite(patch.sortOrder)
        ? patch.sortOrder
        : existing.sortOrder,
    updatedAt: new Date().toISOString(),
  };
  index.items = index.items.map((i) => (i.name === name ? next : i));
  await writeMediaIndex(index);
  return next;
}

/**
 * Move one or more media items into a virtual folder (or root when folderId is '').
 * Unknown folder ids are treated as root. Missing names are reported; known items
 * that already sit in the target folder are left as-is but still counted as moved.
 */
export async function moveMediaToFolder(
  names: string[],
  folderId: string,
): Promise<{ moved: number; missing: string[] }> {
  const index = await readMediaIndex();
  const folderIds = new Set(index.folders.map((f) => f.id));
  const targetId =
    folderId && folderIds.has(folderId) && isSafeFolderId(folderId) ? folderId : '';

  const uniqueNames = [...new Set(names.filter((n) => typeof n === 'string' && n.trim()))];
  const missing: string[] = [];
  const toMove: string[] = [];
  for (const name of uniqueNames) {
    if (index.items.some((i) => i.name === name)) toMove.push(name);
    else missing.push(name);
  }

  if (toMove.length === 0) {
    return { moved: 0, missing };
  }

  const now = new Date().toISOString();
  let nextOrder =
    index.items
      .filter((i) => i.folderId === targetId)
      .reduce((m, i) => Math.max(m, i.sortOrder), -1) + 1;

  const moveSet = new Set(toMove);
  index.items = index.items.map((item) => {
    if (!moveSet.has(item.name)) return item;
    if (item.folderId === targetId) return item;
    return {
      ...item,
      folderId: targetId,
      sortOrder: nextOrder++,
      updatedAt: now,
    };
  });

  await writeMediaIndex(index);
  return { moved: toMove.length, missing };
}

/** Set sortOrder 0..n for names within a folder (or root when folderId ''). */
export async function reorderMediaItems(
  folderId: string,
  orderedNames: string[],
): Promise<MediaMeta[]> {
  const index = await readMediaIndex();
  const fid = folderId && isSafeFolderId(folderId) ? folderId : '';
  const nameSet = new Set(orderedNames);
  let order = 0;
  const updated: MediaMeta[] = [];
  const now = new Date().toISOString();

  // First assign order to listed names that belong to this folder (or will be moved here)
  for (const name of orderedNames) {
    const item = index.items.find((i) => i.name === name);
    if (!item) continue;
    const next = { ...item, folderId: fid, sortOrder: order++, updatedAt: now };
    updated.push(next);
  }

  // Remaining items in this folder keep relative order after listed ones
  for (const item of index.items) {
    if (item.folderId !== fid) continue;
    if (nameSet.has(item.name)) continue;
    updated.push({ ...item, sortOrder: order++, updatedAt: now });
  }

  const byName = new Map(updated.map((i) => [i.name, i]));
  index.items = index.items.map((i) => byName.get(i.name) || i);
  await writeMediaIndex(index);
  return updated;
}

export async function removeMediaMeta(name: string): Promise<void> {
  const index = await readMediaIndex();
  const next = index.items.filter((i) => i.name !== name);
  if (next.length === index.items.length) return;
  await writeMediaIndex({ version: 2, folders: index.folders, items: next });
}
