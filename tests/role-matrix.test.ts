import { describe, expect, it } from 'vitest';
import { roleCan, siteSectionCapability } from '@/lib/admin-roles';

/** capability x role -> allowed (role presets, no custom grants). */
const MATRIX: Array<[string, { owner: boolean; editor: boolean; operator: boolean }]> = [
  ['inbox', { owner: true, editor: true, operator: true }],
  ['leads', { owner: true, editor: true, operator: true }],
  ['content', { owner: true, editor: true, operator: false }],
  ['goods', { owner: true, editor: true, operator: false }],
  ['settings', { owner: true, editor: true, operator: false }],
  ['backup', { owner: true, editor: true, operator: false }],
  ['users', { owner: true, editor: false, operator: false }],
  ['security_owner', { owner: true, editor: false, operator: false }],
  ['restore_backup', { owner: true, editor: false, operator: false }],
];

describe('role matrix', () => {
  it.each(MATRIX)('%s', (cap, expected) => {
    expect(roleCan('owner', cap)).toBe(expected.owner);
    expect(roleCan('editor', cap)).toBe(expected.editor);
    expect(roleCan('operator', cap)).toBe(expected.operator);
  });

  it('operator cannot PATCH protected site sections', () => {
    for (const section of ['settings', 'pages', 'goods', 'headerMenu', 'servicesNav']) {
      const cap = siteSectionCapability(section);
      expect(cap && roleCan('operator', cap)).toBe(false);
    }
  });

  it('custom grants cannot escalate to owner-only capabilities', () => {
    expect(roleCan('editor', 'users', ['users', 'content'])).toBe(false);
    expect(roleCan('operator', 'security_owner', ['security_owner'])).toBe(false);
  });
});
