import { promises as fs } from 'fs';
import path from 'path';
import { z } from 'zod';
import { atomicWriteJson } from './atomic-write';
import { withFileMutex } from './file-mutex';
import { createId } from './id';

export type SessionRecord = {
  id: string;
  fingerprint: string;
  username: string;
  role: string;
  createdAt: string;
  lastSeenAt: string;
  userAgent?: string;
  ip?: string;
};

const sessionRecordSchema = z.object({
  id: z.string().min(1),
  fingerprint: z.string().min(1),
  username: z.string().min(1),
  role: z.string().min(1),
  createdAt: z.string().min(1),
  lastSeenAt: z.string().min(1),
  userAgent: z.string().optional(),
  ip: z.string().optional(),
});

const sessionsStoreSchema = z.object({
  sessions: z.array(sessionRecordSchema),
  revoked: z.array(z.string()).optional(),
});

type SessionsStore = z.infer<typeof sessionsStoreSchema>;

const MAX_SESSIONS = 100;

function dataRoot(): string {
  return process.env.DATA_DIR || path.join(process.cwd(), 'data');
}

export function sessionsFilePath(): string {
  return path.join(dataRoot(), 'admin-sessions.json');
}

/**
 * Read session allowlist store.
 * Returns null if file does not exist.
 * Throws if file is corrupted or fails schema validation (fail closed).
 */
export async function readStoreStrict(): Promise<SessionsStore | null> {
  let raw: string;
  try {
    raw = await fs.readFile(sessionsFilePath(), 'utf-8');
  } catch (err: any) {
    if (err?.code === 'ENOENT') return null;
    throw new Error(`Failed to read sessions store: ${err?.message || String(err)}`);
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch (err: any) {
    throw new Error(`Corrupted sessions JSON: ${err?.message || String(err)}`);
  }

  const result = sessionsStoreSchema.safeParse(parsed);
  if (!result.success) {
    throw new Error(`Invalid sessions schema: ${result.error.message}`);
  }
  return result.data;
}

async function readStore(): Promise<SessionsStore> {
  const store = await readStoreStrict();
  return store || { sessions: [] };
}

async function writeStore(store: SessionsStore): Promise<void> {
  const valid = sessionsStoreSchema.parse(store);
  await atomicWriteJson(sessionsFilePath(), valid);
}

function withSessionsLock<T>(fn: () => Promise<T>): Promise<T> {
  return withFileMutex(sessionsFilePath(), fn);
}

export async function registerSession(input: {
  fingerprint: string;
  username: string;
  role: string;
  userAgent?: string;
  ip?: string;
}): Promise<SessionRecord> {
  return withSessionsLock(async () => {
    const store = await readStore();
    const now = new Date().toISOString();
    store.sessions = store.sessions.filter(s => s.fingerprint !== input.fingerprint);
    const rec: SessionRecord = {
      id: createId(),
      fingerprint: input.fingerprint,
      username: input.username,
      role: input.role,
      createdAt: now,
      lastSeenAt: now,
      userAgent: input.userAgent?.slice(0, 200),
      ip: input.ip,
    };
    store.sessions.unshift(rec);
    if (store.sessions.length > MAX_SESSIONS) {
      store.sessions = store.sessions.slice(0, MAX_SESSIONS);
    }
    await writeStore(store);
    return rec;
  });
}

export async function touchSession(fingerprint: string): Promise<void> {
  return withSessionsLock(async () => {
    const store = await readStore();
    const idx = store.sessions.findIndex(s => s.fingerprint === fingerprint);
    if (idx < 0) return;
    store.sessions[idx] = { ...store.sessions[idx], lastSeenAt: new Date().toISOString() };
    await writeStore(store);
  });
}

export async function listSessions(): Promise<SessionRecord[]> {
  const store = await readStore();
  return store.sessions;
}

export async function revokeSession(id: string): Promise<boolean> {
  return withSessionsLock(async () => {
    const store = await readStore();
    const target = store.sessions.find(s => s.id === id);
    if (!target) return false;
    store.sessions = store.sessions.filter(s => s.id !== id);
    await writeStore(store);
    return true;
  });
}

export async function revokeAllSessions(exceptFingerprint?: string): Promise<number> {
  return withSessionsLock(async () => {
    const store = await readStore();
    const toRemove = exceptFingerprint
      ? store.sessions.filter(s => s.fingerprint !== exceptFingerprint)
      : store.sessions;
    store.sessions = exceptFingerprint
      ? store.sessions.filter(s => s.fingerprint === exceptFingerprint)
      : [];
    await writeStore(store);
    return toRemove.length;
  });
}

export async function revokeSessionsByUsername(username: string): Promise<number> {
  return withSessionsLock(async () => {
    const store = await readStore();
    const toRemove = store.sessions.filter(
      s => s.username.toLowerCase() === username.toLowerCase(),
    );
    store.sessions = store.sessions.filter(
      s => s.username.toLowerCase() !== username.toLowerCase(),
    );
    await writeStore(store);
    return toRemove.length;
  });
}

export async function markFingerprintRevoked(fingerprint: string): Promise<void> {
  return withSessionsLock(async () => {
    const store = await readStore();
    store.sessions = store.sessions.filter(s => s.fingerprint !== fingerprint);
    await writeStore(store);
  });
}

export async function isFingerprintRevoked(fingerprint: string): Promise<boolean> {
  try {
    const store = await readStoreStrict();
    if (!store) return true;
    return !store.sessions.some(s => s.fingerprint === fingerprint);
  } catch {
    return true; // Fail closed on corruption/error
  }
}

/** Explicit allowlist: session fingerprint MUST be registered in sessions.json */
export async function isSessionAllowed(fingerprint: string): Promise<boolean> {
  if (!fingerprint) return false;
  try {
    const store = await readStoreStrict();
    if (!store) return false; // File doesn't exist yet -> fail closed
    return store.sessions.some(s => s.fingerprint === fingerprint);
  } catch (err) {
    console.error('[admin-sessions] fail-closed on store read error:', err);
    return false; // Fail closed on error or corruption
  }
}
