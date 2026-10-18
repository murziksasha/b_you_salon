import { describe, expect, it } from 'vitest';
import { SECTION_TEMPLATES } from './section-templates';

describe('section-templates', () => {
  it('contains expected templates with unique ids', () => {
    const ids = SECTION_TEMPLATES.map(t => t.id);
    const uniqueIds = new Set(ids);
    expect(ids.length).toBe(uniqueIds.size);
    expect(ids).toEqual(
      expect.arrayContaining(['home-doors', 'salon-landing', 'service-page', 'landing-shop', 'contacts-only']),
    );
  });

  it('builds valid sections with proper types for each template', () => {
    for (const template of SECTION_TEMPLATES) {
      expect(template.label).toBeTruthy();
      expect(template.description).toBeTruthy();
      const sections = template.build();
      expect(Array.isArray(sections)).toBe(true);
      expect(sections.length).toBeGreaterThan(0);

      for (const s of sections) {
        expect(s.id).toBeTruthy();
        expect(s.type).toBeTruthy();
        expect(typeof s.visible).toBe('boolean');
      }
    }
  });

  it('builds specific sections for home-doors and salon-landing', () => {
    const homeDoors = SECTION_TEMPLATES.find(t => t.id === 'home-doors');
    expect(homeDoors?.build().map(s => s.type)).toEqual(['doors-hero', 'contacts']);

    const salonLanding = SECTION_TEMPLATES.find(t => t.id === 'salon-landing');
    expect(salonLanding?.build().map(s => s.type)).toEqual([
      'hero',
      'services-grid',
      'advantages',
      'callback',
      'zone-door',
    ]);
  });
});
