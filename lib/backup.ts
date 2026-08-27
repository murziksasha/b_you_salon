import { promises as fs } from 'fs';
import path from 'path';
import { atomicWriteFile } from './atomic-write';
import type { SiteData } from './types';

const DEFAULT_KEEP = 20;

function dataRoot(): string {
  return process.env.DATA_DIR || path.join(process.cwd(), 'data');
}

export function backupsDir(): string {
  return path.join(dataRoot(), 'backups');
}

export interface BackupInfo {
  name: string;
  size: number;
  mtime: string;
}

function stamp(): string {
  return new Date().toISOString().replace(/[:.]/g, '-');
}

function keepCount(): number {
  const n = Number(process.env.BACKUP_KEEP || DEFAULT_KEEP);
  return Number.isFinite(n) && n > 0 ? n : DEFAULT_KEEP;
}

/** Write timestamped snapshot; prune older than BACKUP_KEEP (default 20). */
export async function createSiteBackupFromData(
  data: SiteData,
  options?: { keep?: number; label?: string },
): Promise<BackupInfo> {
  const keep = options?.keep ?? keepCount();
  const dir = backupsDir();
  await fs.mkdir(dir, { recursive: true });

  const label = options?.label ? `-${options.label}` : '';
  const name = `site-${stamp()}${label}.json`;
  const filePath = path.join(dir, name);
  const body = `${JSON.stringify(data, null, 2)}\n`;
  await atomicWriteFile(filePath, body, { encoding: 'utf-8' });

  await pruneBackups(keep);

  const stat = await fs.stat(filePath);
  return { name, size: stat.size, mtime: stat.mtime.toISOString() };
}

export async function listSiteBackups(): Promise<BackupInfo[]> {
  const dir = backupsDir();
  try {
    const files = await fs.readdir(dir);
    const infos: BackupInfo[] = [];
    for (const name of files) {
      if (!name.endsWith('.json') || !name.startsWith('site-')) continue;
      const stat = await fs.stat(path.join(dir, name));
      if (!stat.isFile()) continue;
      infos.push({ name, size: stat.size, mtime: stat.mtime.toISOString() });
    }
    infos.sort((a, b) => (a.mtime < b.mtime ? 1 : -1));
    return infos;
  } catch {
    return [];
  }
}

export function isSafeBackupName(name: string): boolean {
  return /^site-[\w.-]+\.json$/.test(name);
}

export async function readBackupFile(name: string): Promise<string | null> {
  if (!isSafeBackupName(name)) return null;
  const filePath = path.join(backupsDir(), name);
  try {
    return await fs.readFile(filePath, 'utf-8');
  } catch {
    return null;
  }
}

export async function deleteBackupFile(name: string): Promise<boolean> {
  if (!isSafeBackupName(name)) return false;
  const filePath = path.join(backupsDir(), name);
  try {
    await fs.unlink(filePath);
    return true;
  } catch {
    return false;
  }
}

async function pruneBackups(keep: number): Promise<void> {
  if (keep <= 0) return;
  const list = await listSiteBackups();
  if (list.length <= keep) return;
  const dir = backupsDir();
  for (const old of list.slice(keep)) {
    try {
      await fs.unlink(path.join(dir, old.name));
    } catch {
      // ignore
    }
  }
}
