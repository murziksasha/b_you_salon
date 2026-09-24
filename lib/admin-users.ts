import { createHash, randomBytes, scrypt as scryptCb, timingSafeEqual } from 'crypto';
import { promises as fs } from 'fs';
import path from 'path';
import { atomicWriteJson } from './atomic-write';
import { withFileMutex } from './file-mutex';
import { createId } from './id';
import {
  sanitizeGrants,
  type AdminCapability,
  type AdminRole,
} from './admin-roles';
import { revokeSessionsByUsername } from './admin-sessions';

/** Only allow safe alphanumeric usernames: letters, digits, underscore, dot, dash. */
const SAFE_USERNAME_RE = /^[a-zA-Z0-9_.-]{2,32}$/;

export type { AdminCapability, AdminRole } from './admin-roles';
export {
  capabilitiesFor,
  navAllowedForRole,
  presetGrants,
  roleCan,
  sanitizeGrants,
} from './admin-roles';

export type AdminUser = {
  id: string;
  username: string;
  /** scrypt hash: saltHex:hashHex */
  passwordHash: string;
  role: AdminRole;
  /** Checkbox grants. Ignored for owner. Missing = use the role preset. */
  grants?: AdminCapability[];
  createdAt: string;
  disabled?: boolean;
};

export type UserMutateResult = { ok: true } | { error: string };

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

function enabledOwners(store: UsersStore, exceptId?: string): AdminUser[] {
  return store.users.filter((u) => u.role === 'owner' && !u.disabled && u.id !== exceptId);
}

function lastOwnerBlocked(store: UsersStore, target: AdminUser, next: Pick<AdminUser, 'role' | 'disabled'>): boolean {
  if (target.role !== 'owner' || target.disabled) return false;
  const others = enabledOwners(store, target.id);
  if (others.length > 0) return false;
  const stillOwner = (next.role ?? target.role) === 'owner' && !(next.disabled ?? target.disabled);
  return !stillOwner;
}

export async function createAdminUser(input: {
  username: string;
  password: string;
  role: AdminRole;
  grants?: AdminCapability[];
}): Promise<Omit<AdminUser, 'passwordHash'> | { error: string }> {
  const username = input.username.trim();
  if (!username || username.length < 2) return { error: 'Username too short' };
  if (!SAFE_USERNAME_RE.test(username)) {
    return { error: 'Username must be 2-32 chars: letters, digits, _ . - only' };
  }
  if (!input.password || input.password.length < 8) return { error: 'Password must be ≥8 chars' };
  const role = input.role;
  const grants = sanitizeGrants(role, input.grants);
  return withUsersLock(async () => {
  const store = await readStore();
  if (store.users.some(u => u.username.toLowerCase() === username.toLowerCase())) {
    return { error: 'Username already exists' };
  }
  const user: AdminUser = {
    id: createId(),
    username,
    passwordHash: await hashPassword(input.password),
    role,
    createdAt: new Date().toISOString(),
  };
  if (grants) user.grants = grants;
  store.users.push(user);
  await writeStore(store);
  const { passwordHash: _, ...safe } = user;
  return safe;
  });
}

export async function updateAdminUser(
  id: string,
  patch: Partial<Pick<AdminUser, 'role' | 'disabled' | 'grants'>> & { password?: string },
): Promise<UserMutateResult> {
  if (patch.password !== undefined && patch.password.length < 8) {
    return { error: 'Password must be ≥8 chars' };
  }
  return withUsersLock(async () => {
  const store = await readStore();
  const idx = store.users.findIndex(u => u.id === id);
  if (idx < 0) return { error: 'Not found' };
  const cur = store.users[idx];
  const nextRole = patch.role ?? cur.role;
  const nextDisabled = patch.disabled ?? cur.disabled;
  if (lastOwnerBlocked(store, cur, { role: nextRole, disabled: nextDisabled })) {
    return { error: 'Не можна прибрати останнього супер-адміна' };
  }
  const passwordChanged = !!patch.password;
  const roleChanged = patch.role !== undefined && patch.role !== cur.role;
  const disabledChanged = patch.disabled !== undefined && patch.disabled !== cur.disabled;
  const nextGrants = patch.grants !== undefined ? sanitizeGrants(nextRole, patch.grants) : sanitizeGrants(nextRole, cur.grants);
  const grantsChanged = JSON.stringify(nextGrants || []) !== JSON.stringify(cur.grants || []);
  const next: AdminUser = {
    ...cur,
    role: nextRole,
    disabled: nextDisabled,
    passwordHash: patch.password ? await hashPassword(patch.password) : cur.passwordHash,
  };
  if (nextRole === 'owner') {
    delete next.grants;
  } else if (nextGrants) {
    next.grants = nextGrants;
  } else {
    delete next.grants;
  }
  store.users[idx] = next;
  await writeStore(store);
  if (passwordChanged || roleChanged || disabledChanged || grantsChanged) {
    try {
      await revokeSessionsByUsername(cur.username);
    } catch {
      /* best-effort revocation */
    }
  }
  return { ok: true };
  });
}

export async function deleteAdminUser(id: string): Promise<UserMutateResult> {
  return withUsersLock(async () => {
  const store = await readStore();
  const target = store.users.find(u => u.id === id);
  if (!target) return { error: 'Not found' };
  if (lastOwnerBlocked(store, target, { role: 'operator', disabled: true })) {
    return { error: 'Не можна прибрати останнього супер-адміна' };
  }
  store.users = store.users.filter(u => u.id !== id);
  await writeStore(store);
  try {
    await revokeSessionsByUsername(target.username);
  } catch {
    /* best-effort revocation */
  }
  return { ok: true };
  });
}

export async function hasMultiUserMode(): Promise<boolean> {
  const store = await readStore();
  return store.users.some(u => !u.disabled);
}

export function fingerprintSession(token: string): string {
  return createHash('sha256').update(token).digest('hex').slice(0, 16);
}
