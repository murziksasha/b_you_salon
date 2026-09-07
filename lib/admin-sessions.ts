import { promises as fs } from 'fs';
import path from 'path';
import { atomicWriteJson } from './atomic-write';
import { withFileMutex } from './file-mutex';
import { createId } from './id';

export type SessionRecord = {
  id: string;
  /** Short fingerprint of session token for revoke matching */
  fingerprint: string;
  username: string;
  role: string;
  createdAt: string;
  lastSeenAt: string;
  userAgent?: string;
  ip?: string;
};

type SessionsStore = { sessions: SessionRecord[]; revoked?: string[] };
type RevokedStore = SessionsStore;

const MAX_SESSIONS = 50;

function dataRoot(): string {
  return process.env.DATA_DIR || path.join(process.cwd(), 'data');
}

export function sessionsFilePath(): string {
  return path.join(dataRoot(), 'admin-sessions.json');
}

async function readStore(): Promise<SessionsStore> {
  try {
    const raw = await fs.readFile(sessionsFilePath(), 'utf-8');
    const parsed = JSON.parse(raw) as SessionsStore;
    if (!parsed || !Array.isArray(parsed.sessions)) return { sessions: [] };
    return parsed;
  } catch {
    return { sessions: [] };
  }
}

async function writeStore(store: SessionsStore): Promise<void> {
  await atomicWriteJson(sessionsFilePath(), store);
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
  // Replace existing same fingerprint
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
  const store = (await readStore()) as RevokedStore;
  const target = store.sessions.find(s => s.id === id);
  if (!target) return false;
  // Add fingerprint to revocation list so isSessionAllowed() blocks it
  const revoked = new Set(store.revoked || []);
  revoked.add(target.fingerprint);
  store.revoked = Array.from(revoked).slice(-200);
  store.sessions = store.sessions.filter(s => s.id !== id);
  await writeStore(store as SessionsStore);
  return true;
  });
}

export async function revokeAllSessions(exceptFingerprint?: string): Promise<number> {
  return withSessionsLock(async () => {
  const store = (await readStore()) as RevokedStore;
  const revoked = new Set(store.revoked || []);
  const toRemove = exceptFingerprint ? store.sessions.filter(s => s.fingerprint !== exceptFingerprint) : store.sessions;
  // Add all removed fingerprints to the revocation list
  for (const s of toRemove) {
    revoked.add(s.fingerprint);
  }
  store.revoked = Array.from(revoked).slice(-200);
  store.sessions = exceptFingerprint ? store.sessions.filter(s => s.fingerprint === exceptFingerprint) : [];
  const removed = toRemove.length;
  await writeStore(store as SessionsStore);
  return removed;
  });
}

/** Revoke all sessions belonging to a specific username. */
export async function revokeSessionsByUsername(username: string): Promise<number> {
  return withSessionsLock(async () => {
  const store = (await readStore()) as RevokedStore;
  const revoked = new Set(store.revoked || []);
  const toRemove = store.sessions.filter(s => s.username.toLowerCase() === username.toLowerCase());
  for (const s of toRemove) {
    revoked.add(s.fingerprint);
  }
  store.revoked = Array.from(revoked).slice(-200);
  store.sessions = store.sessions.filter(s => s.username.toLowerCase() !== username.toLowerCase());
  await writeStore(store as SessionsStore);
  return toRemove.length;
  });
}

export async function isFingerprintRevoked(fingerprint: string): Promise<boolean> {
  try {
    const raw = await fs.readFile(sessionsFilePath(), 'utf-8');
    const parsed = JSON.parse(raw) as RevokedStore;
    return parsed.revoked?.includes(fingerprint) ?? false;
  } catch {
    return false;
  }
}

export async function markFingerprintRevoked(fingerprint: string): Promise<void> {
  return withSessionsLock(async () => {
  const store = (await readStore()) as RevokedStore;
  const revoked = new Set(store.revoked || []);
  revoked.add(fingerprint);
  store.revoked = Array.from(revoked).slice(-200);
  store.sessions = store.sessions.filter(s => s.fingerprint !== fingerprint);
  await writeStore(store as SessionsStore);
  });
}

export async function isSessionAllowed(fingerprint: string): Promise<boolean> {
  try {
    const raw = await fs.readFile(sessionsFilePath(), 'utf-8');
    const parsed = JSON.parse(raw) as RevokedStore;
    if (parsed.revoked?.includes(fingerprint)) return false;
    return true;
  } catch {
    return true;
  }
}
