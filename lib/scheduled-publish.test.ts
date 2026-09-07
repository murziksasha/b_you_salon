import { promises as fs } from 'fs';
import os from 'os';
import path from 'path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
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

describe('scheduled-publish runner (not inside getSiteData)', () => {
  let tmpDir: string;
  let prev: string | undefined;

  beforeEach(async () => {
    tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'ps-sched-'));
    prev = process.env.DATA_DIR;
    process.env.DATA_DIR = tmpDir;
  });

  afterEach(async () => {
    if (prev === undefined) delete process.env.DATA_DIR;
    else process.env.DATA_DIR = prev;
    await fs.rm(tmpDir, { recursive: true, force: true });
  });

  it('getSiteData does not write due publishes; runner does', async () => {
    const { getSiteData, saveSiteData } = await import('./site-data');
    const data = await getSiteData();
    const past = new Date(Date.now() - 60_000).toISOString();
    const page = data.pages.find(p => p.slug !== '') || data.pages[0];
    page.draft = { title: 'Published by runner', updatedAt: past };
    page.publishAt = past;
    page.visible = false;
    await saveSiteData(data);

    const before = await getSiteData();
    const target = before.pages.find(p => p.id === page.id);
    expect(target?.title).not.toBe('Published by runner');
    expect(target?.publishAt).toBe(past);

    const { runDueScheduledPublishes } = await import('./scheduled-publish-runner');
    const published = await runDueScheduledPublishes();
    expect(published).toContain(page.id);

    const after = await getSiteData();
    const live = after.pages.find(p => p.id === page.id);
    expect(live?.title).toBe('Published by runner');
    expect(live?.publishAt).toBeUndefined();
    expect(live?.visible).toBe(true);
  });
});
