import { promises as fs } from 'fs';
import os from 'os';
import path from 'path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { navAllowedForRole, roleCan } from './admin-users';

describe('roleCan', () => {
  it('owner and legacy can everything', () => {
    expect(roleCan('owner', 'users')).toBe(true);
    expect(roleCan('legacy', 'restore_backup')).toBe(true);
    expect(roleCan('owner', 'content')).toBe(true);
  });

  it('editor cannot manage users or restore', () => {
    expect(roleCan('editor', 'content')).toBe(true);
    expect(roleCan('editor', 'media')).toBe(true);
    expect(roleCan('editor', 'inbox')).toBe(true);
    expect(roleCan('editor', 'users')).toBe(false);
    expect(roleCan('editor', 'restore_backup')).toBe(false);
  });

  it('operator only inbox ops', () => {
    expect(roleCan('operator', 'inbox')).toBe(true);
    expect(roleCan('operator', 'leads')).toBe(true);
    expect(roleCan('operator', 'content')).toBe(false);
    expect(roleCan('operator', 'media')).toBe(false);
    expect(roleCan('operator', 'users')).toBe(false);
  });
});

describe('navAllowedForRole', () => {
  it('operator limited nav', () => {
    expect(navAllowedForRole('operator', '/admin')).toBe(true);
    expect(navAllowedForRole('operator', '/admin/inbox')).toBe(true);
    expect(navAllowedForRole('operator', '/admin/goods')).toBe(false);
    expect(navAllowedForRole('editor', '/admin/goods')).toBe(true);
  });
});

describe('admin user store', () => {
  let tmpDir: string;
  let prev: string | undefined;

  beforeEach(async () => {
    tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'byou-admins-'));
    prev = process.env.DATA_DIR;
    process.env.DATA_DIR = tmpDir;
  });

  afterEach(async () => {
    if (prev === undefined) delete process.env.DATA_DIR;
    else process.env.DATA_DIR = prev;
    await fs.rm(tmpDir, { recursive: true, force: true });
  });

  it('persists grants and refuses to remove the last owner', async () => {
    const { createAdminUser, updateAdminUser, deleteAdminUser, listAdminUsers } = await import('./admin-users');

    const owner = await createAdminUser({
      username: 'boss',
      password: 'password1',
      role: 'owner',
      grants: ['goods'],
    });
    if ('error' in owner) throw new Error(owner.error);
    expect(owner.grants).toBeUndefined();

    const op = await createAdminUser({
      username: 'ira',
      password: 'password1',
      role: 'operator',
      grants: ['orders', 'users', 'goods'],
    });
    if ('error' in op) throw new Error(op.error);
    expect(op.grants).toEqual(['orders', 'goods']);

    const demote = await updateAdminUser(owner.id, { role: 'editor' });
    expect(demote).toEqual({ error: 'Не можна прибрати останнього супер-адміна' });
    const disable = await updateAdminUser(owner.id, { disabled: true });
    expect(disable).toEqual({ error: 'Не можна прибрати останнього супер-адміна' });
    const del = await deleteAdminUser(owner.id);
    expect(del).toEqual({ error: 'Не можна прибрати останнього супер-адміна' });

    const patched = await updateAdminUser(op.id, { grants: ['inbox', 'leads'] });
    expect(patched).toEqual({ ok: true });
    const listed = await listAdminUsers();
    expect(listed.find((u) => u.username === 'ira')?.grants).toEqual(['inbox', 'leads']);
  });
});
