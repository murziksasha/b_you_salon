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
  /** Personal TOTP. Never returned by listAdminUsers. */
  totp?: {
    secret: string;
    enabledAt: string;
    lastUsedStep?: number;
  };
  authVersion?: number;
  /** Hashed recovery codes (scrypt/sha256). */
  recoveryCodes?: string[];
};

export type PublicAdminUser = Omit<AdminUser, 'passwordHash' | 'totp' | 'recoveryCodes'> & { totpEnabled: boolean };

export type UserMutateResult = { ok: true } | { error: string };

type UsersStore = { users: AdminUser[] };

export class AdminStoreError extends Error {
  constructor(message: string, public readonly cause?: unknown) {
    super(message);
    this.name = 'AdminStoreError';
  }
}

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
  let raw: string;
  try {
    raw = await fs.readFile(adminsFilePath(), 'utf-8');
  } catch (err: unknown) {
    if ((err as NodeJS.ErrnoException)?.code === 'ENOENT') {
      return { users: [] };
    }
    throw new AdminStoreError(`Failed to read admin users store: ${(err as Error)?.message || String(err)}`, err);
  }
  try {
    const parsed = JSON.parse(raw) as UsersStore;
    if (!parsed || !Array.isArray(parsed.users)) {
      throw new Error('Store format invalid: users array expected');
    }
    return parsed;
  } catch (err: unknown) {
    throw new AdminStoreError(`Corrupted admins.json store: ${(err as Error)?.message || String(err)}`, err);
  }
}

async function writeStore(store: UsersStore): Promise<void> {
  await atomicWriteJson(adminsFilePath(), store);
}

function withUsersLock<T>(fn: () => Promise<T>): Promise<T> {
  return withFileMutex(adminsFilePath(), fn);
}

export async function listAdminUsers(): Promise<PublicAdminUser[]> {
  const store = await readStore();
  return store.users.map(({ passwordHash: _, totp, recoveryCodes: _r, ...u }) => ({
    ...u,
    totpEnabled: Boolean(totp?.secret),
  }));
}

/** Set (secret) or clear (null) a user's personal TOTP. */
export async function setUserTotp(
  username: string,
  secret: string | null,
  options?: { recoveryCodes?: string[]; lastUsedStep?: number },
): Promise<UserMutateResult> {
  return withUsersLock(async () => {
    const store = await readStore();
    const key = username.trim().toLowerCase();
    const idx = store.users.findIndex((u) => u.username.toLowerCase() === key);
    if (idx < 0) return { error: 'Not found' };
    const cur = store.users[idx];
    const next: AdminUser = {
      ...cur,
      authVersion: (cur.authVersion || 1) + 1,
    };
    if (secret) {
      next.totp = {
        secret,
        enabledAt: new Date().toISOString(),
        ...(options?.lastUsedStep !== undefined ? { lastUsedStep: options.lastUsedStep } : {}),
      };
      if (options?.recoveryCodes) {
        next.recoveryCodes = options.recoveryCodes;
      }
    } else {
      delete next.totp;
      delete next.recoveryCodes;
    }
    store.users[idx] = next;
    await writeStore(store);
    return { ok: true };
  });
}

/** Record last verified TOTP step for replay prevention without changing secret. */
export async function recordUserTotpStep(username: string, step: number): Promise<void> {
  await withUsersLock(async () => {
    const store = await readStore();
    const key = username.trim().toLowerCase();
    const idx = store.users.findIndex((u) => u.username.toLowerCase() === key);
    if (idx < 0) return;
    const cur = store.users[idx];
    if (!cur.totp) return;
    store.users[idx] = {
      ...cur,
      totp: { ...cur.totp, lastUsedStep: step },
    };
    await writeStore(store);
  });
}

/** Consume a recovery code hash if valid, revoke sessions, and increment authVersion. */
export async function consumeUserRecoveryCode(username: string, codeHash: string): Promise<boolean> {
  return withUsersLock(async () => {
    const store = await readStore();
    const key = username.trim().toLowerCase();
    const idx = store.users.findIndex((u) => u.username.toLowerCase() === key);
    if (idx < 0) return false;
    const cur = store.users[idx];
    const codes = cur.recoveryCodes || [];
    const matchIdx = codes.findIndex((c) => c === codeHash);
    if (matchIdx < 0) return false;
    const remaining = [...codes.slice(0, matchIdx), ...codes.slice(matchIdx + 1)];
    store.users[idx] = {
      ...cur,
      recoveryCodes: remaining,
      authVersion: (cur.authVersion || 1) + 1,
    };
    await writeStore(store);
    try {
      await revokeSessionsByUsername(cur.username);
    } catch {
      /* best-effort */
    }
    return true;
  });
}

export async function getAdminUserByUsername(username: string): Promise<AdminUser | null> {
  const store = await readStore();
  const key = username.trim().toLowerCase();
  return store.users.find((u) => u.username.toLowerCase() === key && !u.disabled) || null;
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
}): Promise<Omit<AdminUser, 'passwordHash' | 'recoveryCodes'> | { error: string }> {
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
    if (store.users.some((u) => u.username.toLowerCase() === username.toLowerCase())) {
      return { error: 'Username already exists' };
    }
    const user: AdminUser = {
      id: createId(),
      username,
      passwordHash: await hashPassword(input.password),
      role,
      createdAt: new Date().toISOString(),
      authVersion: 1,
    };
    if (grants) user.grants = grants;
    store.users.push(user);
    await writeStore(store);
    const { passwordHash: _, recoveryCodes: _r, ...safe } = user;
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
    const idx = store.users.findIndex((u) => u.id === id);
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
      authVersion: (cur.authVersion || 1) + 1,
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
    const target = store.users.find((u) => u.id === id);
    if (!target) return { error: 'Not found' };
    if (lastOwnerBlocked(store, target, { role: 'operator', disabled: true })) {
      return { error: 'Не можна прибрати останнього супер-адміна' };
    }
    store.users = store.users.filter((u) => u.id !== id);
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
  return store.users.some((u) => !u.disabled);
}

export function fingerprintSession(token: string): string {
  return createHash('sha256').update(token).digest('hex').slice(0, 16);
}
