import { describe, expect, it } from 'vitest';
import { createDefaultPage, newSection, SECTION_TYPES } from './section-factory';

describe('section-factory', () => {
  it('creates all section types with ids', () => {
    for (const type of SECTION_TYPES) {
      const section = newSection(type);
      expect(section.id).toBeTruthy();
      expect(section.type).toBe(type);
      expect(section.visible).toBe(true);
    }
  });

  it('creates default page with sections', () => {
    const page = createDefaultPage({ title: 'Test', slug: 'test', email: 'a@b.c' });
    expect(page.slug).toBe('test');
    expect(page.sections.length).toBeGreaterThan(2);
    expect(page.sections.some((s) => s.type === 'hero')).toBe(true);
  });

  it('does not expose malfunctions in public factory list', () => {
    expect(SECTION_TYPES.includes('malfunctions' as (typeof SECTION_TYPES)[number])).toBe(false);
    expect(SECTION_TYPES).toContain('doors-hero');
    expect(SECTION_TYPES).toContain('services-grid');
  });
});
