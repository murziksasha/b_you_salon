import { describe, expect, it } from 'vitest';
import { pageSeoHints } from './page-seo';
import type { Page, Section } from './types';

function page(partial: Partial<Page>): Page {
  return {
    id: '1',
    slug: 'x',
    title: 'Title',
    description: 'Desc',
    visible: true,
    sections: [],
    ...partial,
  };
}

describe('pageSeoHints', () => {
  it('warns on empty title and description', () => {
    const hints = pageSeoHints(page({ title: '', description: '' }));
    expect(hints.some(h => h.message.includes('назва'))).toBe(true);
    expect(hints.some(h => h.message.includes('description'))).toBe(true);
  });

  it('warns when description exceeds 160 characters', () => {
    const longDesc = 'a'.repeat(161);
    const hints = pageSeoHints(page({ description: longDesc }));
    expect(hints.some(h => h.message.includes('160'))).toBe(true);
  });

  it('notes HTML mode', () => {
    const hints = pageSeoHints(page({ contentHtml: '<p>hi</p>' }));
    expect(hints.some(h => h.message.includes('HTML'))).toBe(true);
  });

  it('warns when no visible sections exist', () => {
    const hints = pageSeoHints(page({ sections: [{ id: 's1', type: 'hero', visible: false }] }));
    expect(hints.some(h => h.message.includes('Немає видимих секцій'))).toBe(true);
  });

  it('notes absence of hero section', () => {
    const hints = pageSeoHints(
      page({
        sections: [{ id: 's1', type: 'contacts', visible: true }],
      }),
    );
    expect(hints.some(h => h.message.includes('Немає hero-секції'))).toBe(true);
  });

  it('warns on section with image but empty imageAlt', () => {
    const sectionWithImage = {
      id: 's1',
      type: 'hero',
      visible: true,
      image: '/uploads/hero.webp',
      imageAlt: '',
    } as unknown as Section;

    const hints = pageSeoHints(page({ sections: [sectionWithImage] }));
    expect(hints.some(h => h.message.includes('порожній alt зображення'))).toBe(true);
  });
});
