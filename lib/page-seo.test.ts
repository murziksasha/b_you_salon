import { describe, expect, it } from 'vitest';
import { pageSeoHints } from './page-seo';
import type { Page } from './types';

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
    expect(hints.some((h) => h.message.includes('назва'))).toBe(true);
    expect(hints.some((h) => h.message.includes('description'))).toBe(true);
  });

  it('notes HTML mode', () => {
    const hints = pageSeoHints(page({ contentHtml: '<p>hi</p>' }));
    expect(hints.some((h) => h.message.includes('HTML'))).toBe(true);
  });
});
