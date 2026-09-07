import { createHash, randomBytes, scrypt as scryptCb, timingSafeEqual } from 'crypto';
import { promises as fs } from 'fs';
import path from 'path';
import { atomicWriteJson } from './atomic-write';
import { withFileMutex } from './file-mutex';
import { createId } from './id';
import type { AdminRole } from './admin-roles';
import { revokeSessionsByUsername } from './admin-sessions';

/** Only allow safe alphanumeric usernames: letters, digits, underscore, dot, dash. */
const SAFE_USERNAME_RE = /^[a-zA-Z0-9_.-]{2,32}$/;

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

function scryptAsync(password: string, salt: Buffer, keylen: number): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    scryptCb(password, salt, keylen, { N: 16384, r: 8, p: 1 }, (err, derivedKey) => {
      if (err) reject(err);
      else resolve(derivedKey);
    });
  });
}

const SCRYPT_KEYLEN = 64;

export async function hashPassword(password: string, salt?: Buffer): Promise<string> {
  const s = salt || randomBytes(16);
  const hash = await scryptAsync(password, s, SCRYPT_KEYLEN);
  return `${s.toString('hex')}:${hash.toString('hex')}`;
}

export async function verifyPasswordHash(password: string, stored: string): Promise<boolean> {
  const [saltHex, hashHex] = stored.split(':');
  if (!saltHex || !hashHex) return false;
  try {
    const salt = Buffer.from(saltHex, 'hex');
    const expected = Buffer.from(hashHex, 'hex');
    const actual = await scryptAsync(password, salt, SCRYPT_KEYLEN);
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

function withUsersLock<T>(fn: () => Promise<T>): Promise<T> {
  return withFileMutex(adminsFilePath(), fn);
}

export async function listAdminUsers(): Promise<Omit<AdminUser, 'passwordHash'>[]> {
  const store = await readStore();
  return store.users.map(({ passwordHash: _, ...u }) => u);
}

export async function getAdminUserByUsername(username: string): Promise<AdminUser | null> {
  const store = await readStore();
  const key = username.trim().toLowerCase();
  return store.users.find(u => u.username.toLowerCase() === key && !u.disabled) || null;
}

export async function createAdminUser(input: {
  username: string;
  password: string;
  role: AdminRole;
}): Promise<Omit<AdminUser, 'passwordHash'> | { error: string }> {
  const username = input.username.trim();
  if (!username || username.length < 2) return { error: 'Username too short' };
  if (!SAFE_USERNAME_RE.test(username)) {
    return { error: 'Username must be 2-32 chars: letters, digits, _ . - only' };
  }
  if (!input.password || input.password.length < 8) return { error: 'Password must be ≥8 chars' };
  return withUsersLock(async () => {
  const store = await readStore();
  if (store.users.some(u => u.username.toLowerCase() === username.toLowerCase())) {
    return { error: 'Username already exists' };
  }
  const user: AdminUser = {
    id: createId(),
    username,
    passwordHash: await hashPassword(input.password),
    role: input.role,
    createdAt: new Date().toISOString(),
  };
  store.users.push(user);
  await writeStore(store);
  const { passwordHash: _, ...safe } = user;
  return safe;
  });
}

export async function updateAdminUser(
  id: string,
  patch: Partial<Pick<AdminUser, 'role' | 'disabled'>> & { password?: string },
): Promise<boolean> {
  if (patch.password !== undefined && patch.password.length < 8) {
    return false;
  }
  return withUsersLock(async () => {
  const store = await readStore();
  const idx = store.users.findIndex(u => u.id === id);
  if (idx < 0) return false;
  const cur = store.users[idx];
  const passwordChanged = !!patch.password;
  const roleChanged = patch.role !== undefined && patch.role !== cur.role;
  const disabledChanged = patch.disabled !== undefined && patch.disabled !== cur.disabled;
  store.users[idx] = {
    ...cur,
    role: patch.role ?? cur.role,
    disabled: patch.disabled ?? cur.disabled,
    passwordHash: patch.password ? await hashPassword(patch.password) : cur.passwordHash,
  };
  await writeStore(store);
  // Revoke all sessions for this user when security-relevant fields change
  if (passwordChanged || roleChanged || disabledChanged) {
    try {
      await revokeSessionsByUsername(cur.username);
    } catch {
      /* best-effort revocation */
    }
  }
  return true;
  });
}

export async function deleteAdminUser(id: string): Promise<boolean> {
  return withUsersLock(async () => {
  const store = await readStore();
  const before = store.users.length;
  const target = store.users.find(u => u.id === id);
  if (!target) return false;
  store.users = store.users.filter(u => u.id !== id);
  if (store.users.length === before) return false;
  await writeStore(store);
  // Revoke all sessions belonging to the deleted user
  try {
    await revokeSessionsByUsername(target.username);
  } catch {
    /* best-effort revocation */
  }
  return true;
  });
}

export async function hasMultiUserMode(): Promise<boolean> {
  const store = await readStore();
  return store.users.some(u => !u.disabled);
}

export function fingerprintSession(token: string): string {
  return createHash('sha256').update(token).digest('hex').slice(0, 16);
}
