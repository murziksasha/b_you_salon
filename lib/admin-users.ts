import { createHash, randomBytes, scryptSync, timingSafeEqual } from 'crypto';
import { promises as fs } from 'fs';
import path from 'path';
import { atomicWriteJson } from './atomic-write';
import { createId } from './id';
import type { AdminRole } from './admin-roles';

export type { AdminRole } from './admin-roles';
export { navAllowedForRole, roleCan } from './admin-roles';

export type AdminUser = {
  id: string;
  username: string;
  /** scrypt hash: saltHex:hashHex */
  passwordHash: string;
  role: AdminRole;
  createdAt: string;
  disabled?: boolean;
};

type UsersStore = { users: AdminUser[] };

function dataRoot(): string {
  return process.env.DATA_DIR || path.join(process.cwd(), 'data');
}

export function adminsFilePath(): string {
  return path.join(dataRoot(), 'admins.json');
}

export function hashPassword(password: string, salt?: Buffer): string {
  const s = salt || randomBytes(16);
  const hash = scryptSync(password, s, 64);
  return `${s.toString('hex')}:${hash.toString('hex')}`;
}

export function verifyPasswordHash(password: string, stored: string): boolean {
  const [saltHex, hashHex] = stored.split(':');
  if (!saltHex || !hashHex) return false;
  try {
    const salt = Buffer.from(saltHex, 'hex');
    const expected = Buffer.from(hashHex, 'hex');
    const actual = scryptSync(password, salt, 64);
    if (expected.length !== actual.length) return false;
    return timingSafeEqual(expected, actual);
  } catch {
    return false;
  }
}

async function readStore(): Promise<UsersStore> {
  try {
    const raw = await fs.readFile(adminsFilePath(), 'utf-8');
    const parsed = JSON.parse(raw) as UsersStore;
    if (!parsed || !Array.isArray(parsed.users)) return { users: [] };
    return parsed;
  } catch {
    return { users: [] };
  }
}

async function writeStore(store: UsersStore): Promise<void> {
  await atomicWriteJson(adminsFilePath(), store);
}

export async function listAdminUsers(): Promise<Omit<AdminUser, 'passwordHash'>[]> {
  const store = await readStore();
  return store.users.map(({ passwordHash: _, ...u }) => u);
}

export async function getAdminUserByUsername(username: string): Promise<AdminUser | null> {
  const store = await readStore();
  const key = username.trim().toLowerCase();
  return store.users.find((u) => u.username.toLowerCase() === key && !u.disabled) || null;
}

export async function createAdminUser(input: {
  username: string;
  password: string;
  role: AdminRole;
}): Promise<Omit<AdminUser, 'passwordHash'> | { error: string }> {
  const username = input.username.trim();
  if (!username || username.length < 2) return { error: 'Username too short' };
  if (!input.password || input.password.length < 8) return { error: 'Password must be ≥8 chars' };
  const store = await readStore();
  if (store.users.some((u) => u.username.toLowerCase() === username.toLowerCase())) {
    return { error: 'Username already exists' };
  }
  const user: AdminUser = {
    id: createId(),
    username,
    passwordHash: hashPassword(input.password),
    role: input.role,
    createdAt: new Date().toISOString(),
  };
  store.users.push(user);
  await writeStore(store);
  const { passwordHash: _, ...safe } = user;
  return safe;
}

export async function updateAdminUser(
  id: string,
  patch: Partial<Pick<AdminUser, 'role' | 'disabled'>> & { password?: string },
): Promise<boolean> {
  const store = await readStore();
  const idx = store.users.findIndex((u) => u.id === id);
  if (idx < 0) return false;
  const cur = store.users[idx];
  store.users[idx] = {
    ...cur,
    role: patch.role ?? cur.role,
    disabled: patch.disabled ?? cur.disabled,
    passwordHash: patch.password ? hashPassword(patch.password) : cur.passwordHash,
  };
  await writeStore(store);
  return true;
}

export async function deleteAdminUser(id: string): Promise<boolean> {
  const store = await readStore();
  const before = store.users.length;
  store.users = store.users.filter((u) => u.id !== id);
  if (store.users.length === before) return false;
  await writeStore(store);
  return true;
}

export async function hasMultiUserMode(): Promise<boolean> {
  const store = await readStore();
  return store.users.some((u) => !u.disabled);
}

export function fingerprintSession(token: string): string {
  return createHash('sha256').update(token).digest('hex').slice(0, 16);
}
