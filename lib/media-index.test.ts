import { promises as fs } from 'fs';
import os from 'os';
import path from 'path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import {
  createMediaFolder,
  deleteMediaFolder,
  isSafeFolderId,
  moveMediaToFolder,
  patchMediaMeta,
  readMediaIndex,
  reorderMediaItems,
  slugifyFolderLabel,
  upsertMediaMeta,
} from './media-index';

describe('media-index folders', () => {
  let tmpDir: string;
  let prevDataDir: string | undefined;

  beforeEach(async () => {
    tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'ps-media-'));
    prevDataDir = process.env.DATA_DIR;
    process.env.DATA_DIR = tmpDir;
  });

  afterEach(async () => {
    if (prevDataDir === undefined) delete process.env.DATA_DIR;
    else process.env.DATA_DIR = prevDataDir;
    await fs.rm(tmpDir, { recursive: true, force: true });
  });

  it('validates folder ids and slugifies labels', () => {
    expect(isSafeFolderId('products')).toBe(true);
    expect(isSafeFolderId('all')).toBe(false);
    expect(isSafeFolderId('../x')).toBe(false);
    expect(slugifyFolderLabel('Кавові машини')).toMatch(/./);
  });

  it('migrates empty / v1-like file to v2 with folders', async () => {
    await fs.writeFile(
      path.join(tmpDir, 'media-index.json'),
      JSON.stringify({
        version: 1,
        items: [{ name: 'a.webp', purpose: 'product', tags: [] }],
      }),
      'utf-8',
    );
    const index = await readMediaIndex();
    expect(index.version).toBe(2);
    expect(index.folders).toEqual([]);
    expect(index.items[0].folderId).toBe('');
    expect(index.items[0].sortOrder).toBe(0);
  });

  it('creates folder and assigns items; reorder + delete moves to root', async () => {
    const folder = await createMediaFolder('Кава');
    expect(folder.label).toBe('Кава');
    expect(isSafeFolderId(folder.id)).toBe(true);

    await upsertMediaMeta({
      name: 'one.webp',
      purpose: 'product',
      tags: [],
      folderId: folder.id,
    });
    await upsertMediaMeta({
      name: 'two.webp',
      purpose: 'product',
      tags: [],
      folderId: folder.id,
    });

    await reorderMediaItems(folder.id, ['two.webp', 'one.webp']);
    let index = await readMediaIndex();
    const two = index.items.find((i) => i.name === 'two.webp');
    const one = index.items.find((i) => i.name === 'one.webp');
    expect(two?.sortOrder).toBe(0);
    expect(one?.sortOrder).toBe(1);

    await patchMediaMeta('one.webp', { folderId: '' });
    index = await readMediaIndex();
    expect(index.items.find((i) => i.name === 'one.webp')?.folderId).toBe('');

    const ok = await deleteMediaFolder(folder.id);
    expect(ok).toBe(true);
    index = await readMediaIndex();
    expect(index.folders).toHaveLength(0);
    expect(index.items.every((i) => i.folderId === '')).toBe(true);
  });

  it('bulk-moves items into a folder and back to root', async () => {
    const folder = await createMediaFolder('logo');
    await upsertMediaMeta({ name: 'a.webp', purpose: 'other', tags: [] });
    await upsertMediaMeta({ name: 'b.webp', purpose: 'other', tags: [] });
    await upsertMediaMeta({ name: 'c.webp', purpose: 'other', tags: [] });

    const r1 = await moveMediaToFolder(['a.webp', 'b.webp', 'missing.webp'], folder.id);
    expect(r1.moved).toBe(2);
    expect(r1.missing).toEqual(['missing.webp']);

    let index = await readMediaIndex();
    expect(index.items.find((i) => i.name === 'a.webp')?.folderId).toBe(folder.id);
    expect(index.items.find((i) => i.name === 'b.webp')?.folderId).toBe(folder.id);
    expect(index.items.find((i) => i.name === 'c.webp')?.folderId).toBe('');

    const r2 = await moveMediaToFolder(['a.webp'], '');
    expect(r2.moved).toBe(1);
    index = await readMediaIndex();
    expect(index.items.find((i) => i.name === 'a.webp')?.folderId).toBe('');

    const r3 = await moveMediaToFolder(['b.webp'], 'not-a-real-folder');
    expect(r3.moved).toBe(1);
    index = await readMediaIndex();
    expect(index.items.find((i) => i.name === 'b.webp')?.folderId).toBe('');
  });
});
