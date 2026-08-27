import { promises as fs } from 'fs';
import path from 'path';
import { atomicWriteJson } from './atomic-write';
import { createId } from './id';

export type ActivityKind =
  | 'login'
  | 'logout'
  | 'site_save'
  | 'site_restore'
  | 'media_upload'
  | 'media_delete'
  | 'lead_status'
  | 'order_status'
  | 'product_bulk'
  | 'settings'
  | 'security'
  | 'other';

export type ActivityEntry = {
  id: string;
  at: string;
  kind: ActivityKind;
  message: string;
  actor?: string;
  detail?: string;
};

type ActivityStore = { entries: ActivityEntry[] };

const MAX_ENTRIES = 200;

function dataRoot(): string {
  return process.env.DATA_DIR || path.join(process.cwd(), 'data');
}

export function activityFilePath(): string {
  return path.join(dataRoot(), 'admin-activity.json');
}

async function readStore(): Promise<ActivityStore> {
  try {
    const raw = await fs.readFile(activityFilePath(), 'utf-8');
    const parsed = JSON.parse(raw) as ActivityStore;
    if (!parsed || !Array.isArray(parsed.entries)) return { entries: [] };
    return parsed;
  } catch {
    return { entries: [] };
  }
}

async function writeStore(store: ActivityStore): Promise<void> {
  await atomicWriteJson(activityFilePath(), store);
}

export async function listActivity(limit = 50): Promise<ActivityEntry[]> {
  const store = await readStore();
  return store.entries.slice(0, Math.max(1, Math.min(limit, MAX_ENTRIES)));
}

export async function appendActivity(input: {
  kind: ActivityKind;
  message: string;
  actor?: string;
  detail?: string;
}): Promise<ActivityEntry> {
  const store = await readStore();
  const entry: ActivityEntry = {
    id: createId(),
    at: new Date().toISOString(),
    kind: input.kind,
    message: input.message.slice(0, 300),
    ...(input.actor ? { actor: input.actor.slice(0, 80) } : {}),
    ...(input.detail ? { detail: input.detail.slice(0, 400) } : {}),
  };
  store.entries.unshift(entry);
  if (store.entries.length > MAX_ENTRIES) {
    store.entries = store.entries.slice(0, MAX_ENTRIES);
  }
  await writeStore(store);
  return entry;
}
