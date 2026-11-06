import { promises as fs } from 'fs';
import os from 'os';
import path from 'path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
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

  it('retries rename on EPERM then succeeds', async () => {
    const target = path.join(tmpDir, 'retry.json');
    const busy = Object.assign(new Error('busy'), { code: 'EPERM' });
    const rename = vi.spyOn(fs, 'rename');
    rename.mockRejectedValueOnce(busy);
    await atomicWriteJson(target, { retried: true });
    rename.mockRestore();
    const raw = await fs.readFile(target, 'utf-8');
    expect(JSON.parse(raw)).toEqual({ retried: true });
  });

  it('aborts and preserves existing file when rename persistently fails', async () => {
    const target = path.join(tmpDir, 'important.json');
    await atomicWriteFile(target, '{"intact":true}', { encoding: 'utf-8' });

    const ebusy = Object.assign(new Error('locked forever'), { code: 'EBUSY' });
    const rename = vi.spyOn(fs, 'rename').mockRejectedValue(ebusy);

    await expect(atomicWriteFile(target, '{"corrupted":true}')).rejects.toThrow('locked forever');
    rename.mockRestore();

    // Verify original file is 100% intact and untouched
    const content = await fs.readFile(target, 'utf-8');
    expect(content).toBe('{"intact":true}');

    // Verify temp files are cleaned up
    const leftovers = (await fs.readdir(tmpDir)).filter((n) => n.includes('.tmp'));
    expect(leftovers).toHaveLength(0);
  });
});
