import { promises as fs } from 'fs';
import os from 'os';
import path from 'path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { createId } from './id';

describe('site-data helpers', () => {
  let tmpDir: string;
  let prevDataDir: string | undefined;

  beforeEach(async () => {
    tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'ps-site-'));
    prevDataDir = process.env.DATA_DIR;
    process.env.DATA_DIR = tmpDir;
  });

  afterEach(async () => {
    if (prevDataDir === undefined) delete process.env.DATA_DIR;
    else process.env.DATA_DIR = prevDataDir;
    await fs.rm(tmpDir, { recursive: true, force: true });
  });

  it(
    'getSiteData seeds defaults when file missing',
    async () => {
      const { getSiteData } = await import('./site-data');
      const data = await getSiteData();
      expect(data.pages.length).toBeGreaterThan(0);
      expect(data.settings.title).toBeTruthy();
      const raw = await fs.readFile(path.join(tmpDir, 'site.json'), 'utf-8');
      expect(raw).toContain('settings');
    },
    15_000,
  );

  it('cache returns clones and picks up external file changes', async () => {
    const { getSiteData } = await import('./site-data');
    const a = await getSiteData();
    a.settings.title = 'mutated-in-memory';
    const b = await getSiteData();
    expect(b.settings.title).not.toBe('mutated-in-memory');

    const file = path.join(tmpDir, 'site.json');
    const raw = JSON.parse(await fs.readFile(file, 'utf-8'));
    raw.settings.title = 'edited-on-disk-with-different-length';
    await fs.writeFile(file, JSON.stringify(raw));
    const later = new Date(Date.now() + 5000);
    await fs.utimes(file, later, later);
    expect((await getSiteData()).settings.title).toBe('edited-on-disk-with-different-length');
  });

  it('createPage ensures unique slug and protect home delete', async () => {
    const { getSiteData, createPage, deletePage, saveSiteData } = await import('./site-data');
    const data = await getSiteData();

    const p1 = await createPage({
      slug: 'test-page',
      title: 'Test',
      description: 'd',
      visible: true,
      sections: [],
    });
    expect(p1.slug).toBe('test-page');

    const p2 = await createPage({
      slug: 'test-page',
      title: 'Test 2',
      description: 'd',
      visible: true,
      sections: [],
    });
    expect(p2.slug).not.toBe('test-page');
    expect(p2.slug.startsWith('test-page')).toBe(true);

    const home = data.pages.find((p) => p.slug === '');
    if (home) {
      const deleted = await deletePage(home.id);
      expect(deleted).toBe(false);
    }

    expect(await deletePage(p1.id)).toBe(true);
    expect(await deletePage(createId())).toBe(false);

    // round-trip save
    const again = await getSiteData();
    await saveSiteData(again);
  });
});
