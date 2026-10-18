import { describe, expect, it, vi } from 'vitest';

vi.mock('next/navigation', () => ({ redirect: vi.fn() }));
vi.mock('@/lib/auth', () => ({ getSession: vi.fn(), getSessionClaims: vi.fn() }));
vi.mock('@/lib/require-role', () => ({ resolveAdminAccess: vi.fn() }));

import { decidePageAccess } from './page-guard';

describe('decidePageAccess', () => {
  it('sends anonymous users to login', () => {
    expect(decidePageAccess(null, '/admin/goods').kind).toBe('login');
  });

  it('redirects an operator away from content pages', () => {
    const d = decidePageAccess({ username: 'op', role: 'operator', grants: ['inbox', 'leads'] }, '/admin/goods');
    expect(d).toEqual({ kind: 'redirect', to: '/admin/inbox' });
  });

  it('allows an operator into inbox', () => {
    expect(decidePageAccess({ username: 'op', role: 'operator', grants: ['inbox'] }, '/admin/inbox').kind).toBe('ok');
  });

  it('allows owner everywhere', () => {
    expect(decidePageAccess({ username: 'o', role: 'owner', grants: [] }, '/admin/settings').kind).toBe('ok');
  });
});
