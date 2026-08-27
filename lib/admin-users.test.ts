import { describe, expect, it } from 'vitest';
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
