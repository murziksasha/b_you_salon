import { promises as fs } from 'fs';
import os from 'os';
import path from 'path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { atomicWriteFile, atomicWriteJson } from './atomic-write';

describe('atomicWrite', () => {
  let tmpDir: string;

  beforeEach(async () => {
    tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'ps-atomic-'));
  });

  afterEach(async () => {
    await fs.rm(tmpDir, { recursive: true, force: true });
  });

  it('writes file via temp rename', async () => {
    const target = path.join(tmpDir, 'out.json');
    await atomicWriteJson(target, { ok: true });
    const raw = await fs.readFile(target, 'utf-8');
    expect(JSON.parse(raw)).toEqual({ ok: true });
  });

  it('overwrites existing without leaving .tmp', async () => {
    const target = path.join(tmpDir, 'site.json');
    await atomicWriteFile(target, 'v1', { encoding: 'utf-8' });
    await atomicWriteFile(target, 'v2', { encoding: 'utf-8' });
    expect(await fs.readFile(target, 'utf-8')).toBe('v2');
    const leftovers = (await fs.readdir(tmpDir)).filter((n) => n.includes('.tmp'));
    expect(leftovers).toHaveLength(0);
  });
});
