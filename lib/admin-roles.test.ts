import { describe, expect, it } from 'vitest';
import {
  capabilitiesFor,
  firstAllowedAdminPath,
  grantsEqual,
  navAllowedForRole,
  presetGrants,
  roleCan,
  roleFromPreset,
  sanitizeGrants,
  siteSectionCapability,
} from './admin-roles';
import { changedSiteSections, siteWriteDeniedCapability } from './admin-site-auth';
import type { SiteData } from './types';

describe('roleCan', () => {
  it('owner and legacy can everything', () => {
    expect(roleCan('owner', 'users')).toBe(true);
    expect(roleCan('legacy', 'restore_backup')).toBe(true);
    expect(roleCan('owner', 'content')).toBe(true);
    expect(roleCan('owner', 'telegram', [])).toBe(true);
  });

  it('editor cannot manage users or restore', () => {
    expect(roleCan('editor', 'content')).toBe(true);
    expect(roleCan('editor', 'media')).toBe(true);
    expect(roleCan('editor', 'inbox')).toBe(true);
    expect(roleCan('editor', 'telegram')).toBe(true);
    expect(roleCan('editor', 'users')).toBe(false);
    expect(roleCan('editor', 'restore_backup')).toBe(false);
    expect(roleCan('editor', 'security_owner')).toBe(false);
  });

  it('operator only inbox ops by default', () => {
    expect(roleCan('operator', 'inbox')).toBe(true);
    expect(roleCan('operator', 'leads')).toBe(true);
    expect(roleCan('operator', 'stats')).toBe(true);
    expect(roleCan('operator', 'content')).toBe(false);
    expect(roleCan('operator', 'media')).toBe(false);
    expect(roleCan('operator', 'users')).toBe(false);
    expect(roleCan('operator', 'telegram')).toBe(false);
    expect(roleCan('operator', 'ops')).toBe(false);
  });

  it('grants override the preset for non-owners', () => {
    expect(roleCan('operator', 'goods', ['orders', 'goods'])).toBe(true);
    expect(roleCan('operator', 'inbox', ['orders', 'goods'])).toBe(false);
    expect(roleCan('editor', 'content', ['goods'])).toBe(false);
    expect(roleCan('operator', 'users', ['users', 'goods'])).toBe(false);
  });
});

describe('sanitizeGrants', () => {
  it('strips owner-only and unknown keys', () => {
    expect(sanitizeGrants('operator', ['goods', 'users', 'nope', 'goods'])).toEqual(['goods']);
    expect(sanitizeGrants('owner', ['goods'])).toBeUndefined();
    expect(sanitizeGrants('editor', undefined)).toBeUndefined();
    expect(sanitizeGrants('editor', 'x')).toEqual([]);
  });
});

describe('presets', () => {
  it('maps UI presets to roles and grant seeds', () => {
    expect(roleFromPreset('full')).toBe('editor');
    expect(roleFromPreset('operator')).toBe('operator');
    expect(presetGrants('operator')).toContain('inbox');
    expect(presetGrants('operator')).not.toContain('telegram');
    expect(presetGrants('editor')).toContain('telegram');
    expect(presetGrants('full')).toEqual(presetGrants('editor'));
    expect(presetGrants('owner')).toContain('users');
  });
});

describe('navAllowedForRole', () => {
  it('operator limited nav', () => {
    expect(navAllowedForRole('operator', '/admin')).toBe(true);
    expect(navAllowedForRole('operator', '/admin/inbox')).toBe(true);
    expect(navAllowedForRole('operator', '/admin/goods')).toBe(false);
    expect(navAllowedForRole('operator', '/admin/ops')).toBe(false);
    expect(navAllowedForRole('editor', '/admin/goods')).toBe(true);
    expect(navAllowedForRole('editor', '/admin/settings')).toBe(true);
  });

  it('custom grants drive nav', () => {
    expect(navAllowedForRole('operator', '/admin/goods', ['goods'])).toBe(true);
    expect(navAllowedForRole('operator', '/admin/ops', ['telegram'])).toBe(true);
    expect(navAllowedForRole('operator', '/admin/settings', ['backup'])).toBe(true);
    expect(navAllowedForRole('operator', '/admin/inbox', ['goods'])).toBe(false);
    expect(firstAllowedAdminPath('operator', ['goods'])).toBe('/admin/goods');
  });
});

describe('site slices', () => {
  it('maps sections to capabilities', () => {
    expect(siteSectionCapability('pages')).toBe('content');
    expect(siteSectionCapability('headerMenuShop')).toBe('content');
    expect(siteSectionCapability('goods')).toBe('goods');
    expect(siteSectionCapability('servicesNav')).toBe('services');
    expect(siteSectionCapability('settings')).toBe('settings');
  });

  it('detects changed slices and denies missing caps', () => {
    const current = {
      settings: { title: 'A' },
      pages: [{ id: '1' }],
      goods: [{ id: 'g1' }],
      services: [],
      headerMenu: [],
      servicesNav: [],
    } as unknown as SiteData;
    const next = {
      ...current,
      goods: [{ id: 'g2' }],
    } as unknown as SiteData;
    expect(changedSiteSections(current, next)).toEqual(['goods']);
    expect(siteWriteDeniedCapability('operator', ['goods'], current, next)).toBeNull();
    expect(siteWriteDeniedCapability('operator', ['inbox'], current, next)).toBe('goods');
    const pagesNext = { ...current, pages: [{ id: '2' }] } as unknown as SiteData;
    expect(siteWriteDeniedCapability('operator', ['goods'], current, pagesNext)).toBe('content');
    expect(siteWriteDeniedCapability('editor', undefined, current, pagesNext)).toBeNull();
  });
});

describe('grantsEqual', () => {
  it('order-independent', () => {
    expect(grantsEqual(['media', 'goods'], ['goods', 'media'])).toBe(true);
    expect(grantsEqual(['goods'], ['media'])).toBe(false);
    expect(capabilitiesFor('owner').has('users')).toBe(true);
  });
});
