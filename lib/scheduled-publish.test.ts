import { describe, expect, it } from 'vitest';
import { applyScheduledPublishes } from './scheduled-publish';
import type { SiteData } from './types';

function site(pages: SiteData['pages']): SiteData {
  return {
    settings: {} as SiteData['settings'],
    headerMenu: [],
    servicesNav: [],
    pages,
    goods: [],
  };
}

describe('scheduled-publish', () => {
  it('promotes draft when publishAt is past', () => {
    const past = new Date(Date.now() - 60_000).toISOString();
    const data = site([
      {
        id: 'p1',
        slug: 'x',
        title: 'Live',
        description: 'd',
        visible: false,
        sections: [],
        draft: { title: 'Draft title', sections: [], updatedAt: past },
        publishAt: past,
      },
    ]);
    const { site: next, published } = applyScheduledPublishes(data);
    expect(published).toEqual(['p1']);
    expect(next.pages[0].title).toBe('Draft title');
    expect(next.pages[0].draft).toBeUndefined();
    expect(next.pages[0].publishAt).toBeUndefined();
    expect(next.pages[0].visible).toBe(true);
  });

  it('skips future publishAt', () => {
    const future = new Date(Date.now() + 3600_000).toISOString();
    const data = site([
      {
        id: 'p1',
        slug: 'x',
        title: 'Live',
        description: 'd',
        visible: true,
        sections: [],
        publishAt: future,
        draft: { title: 'Later', updatedAt: future },
      },
    ]);
    const { published } = applyScheduledPublishes(data);
    expect(published).toEqual([]);
  });
});
