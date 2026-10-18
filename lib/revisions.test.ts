import { promises as fs } from 'fs';
import os from 'os';
import path from 'path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { getPageRevision, listPageRevisions, savePageRevision } from './revisions';
import type { Page } from './types';

function createMockPage(id: string, title: string): Page {
  return {
    id,
    slug: id,
    title,
    description: `Description for ${title}`,
    visible: true,
    sections: [],
  };
}

describe('revisions', () => {
  let tmpDir: string;
  const originalDataDir = process.env.DATA_DIR;

  beforeAll(async () => {
    tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'byou-revisions-test-'));
    process.env.DATA_DIR = tmpDir;
  });

  afterAll(async () => {
    process.env.DATA_DIR = originalDataDir;
    try {
      await fs.rm(tmpDir, { recursive: true, force: true });
    } catch {
      /* ignore */
    }
  });

  it('saves and retrieves page revisions', async () => {
    const page = createMockPage('page-1', 'Initial Title');
    const meta = await savePageRevision(page, { actor: 'editor1', label: 'First draft' });

    expect(meta.id).toBeDefined();
    expect(meta.pageId).toBe('page-1');
    expect(meta.title).toBe('Initial Title');
    expect(meta.actor).toBe('editor1');
    expect(meta.label).toBe('First draft');

    const retrieved = await getPageRevision('page-1', meta.id);
    expect(retrieved).not.toBeNull();
    expect(retrieved?.page.title).toBe('Initial Title');
    expect(retrieved?.actor).toBe('editor1');
  });

  it('lists revisions sorted descending by timestamp', async () => {
    const page = createMockPage('page-2', 'V1');
    const r1 = await savePageRevision(page);

    // slight delay to ensure distinct ISO timestamp string
    await new Promise(r => setTimeout(r, 10));
    page.title = 'V2';
    const r2 = await savePageRevision(page);

    const list = await listPageRevisions('page-2');
    expect(list).toHaveLength(2);
    expect(list[0].id).toBe(r2.id);
    expect(list[1].id).toBe(r1.id);
  });

  it('returns null / empty array for non-existent revisions', async () => {
    expect(await listPageRevisions('non-existent')).toEqual([]);
    expect(await getPageRevision('page-1', 'invalid-id')).toBeNull();
  });
});
