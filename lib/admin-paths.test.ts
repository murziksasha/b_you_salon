import { describe, expect, it } from 'vitest';
import { isKnownAdminPath, safeAdminReturnPath } from './admin-paths';

describe('admin-paths', () => {
  it('accepts known admin sections', () => {
    expect(isKnownAdminPath('/admin')).toBe(true);
    expect(isKnownAdminPath('/admin/inbox')).toBe(true);
    expect(isKnownAdminPath('/admin/pages/home')).toBe(true);
    expect(isKnownAdminPath('/admin/login')).toBe(false);
    expect(isKnownAdminPath('/admin/l')).toBe(false);
    expect(isKnownAdminPath('/salon')).toBe(false);
  });

  it('safeAdminReturnPath falls back for typos', () => {
    expect(safeAdminReturnPath(null)).toBe('/admin');
    expect(safeAdminReturnPath('/admin/l')).toBe('/admin');
    expect(safeAdminReturnPath('/admin/login')).toBe('/admin');
    expect(safeAdminReturnPath('/admin/leads')).toBe('/admin/leads');
    expect(safeAdminReturnPath('/admin/pages/foo?x=1')).toBe('/admin/pages/foo?x=1');
  });
});
