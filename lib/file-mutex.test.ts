import { describe, expect, it } from 'vitest';
import { mutexKey, withFileMutex } from './file-mutex';

describe('withFileMutex', () => {
  it('serializes overlapping work on the same file', async () => {
    const file = 'C:\\data\\leads.json';
    const log: string[] = [];
    const slow = withFileMutex(file, async () => {
      log.push('a-start');
      await new Promise(r => setTimeout(r, 30));
      log.push('a-end');
      return 'a';
    });
    const fast = withFileMutex(file, async () => {
      log.push('b');
      return 'b';
    });
    const [a, b] = await Promise.all([slow, fast]);
    expect(a).toBe('a');
    expect(b).toBe('b');
    expect(log).toEqual(['a-start', 'a-end', 'b']);
  });

  it('allows concurrent work on different files', async () => {
    const started: string[] = [];
    const a = withFileMutex('leads.json', async () => {
      started.push('a');
      await new Promise(r => setTimeout(r, 25));
      return 'a';
    });
    const b = withFileMutex('orders.json', async () => {
      started.push('b');
      return 'b';
    });
    await Promise.all([a, b]);
    expect(started).toContain('a');
    expect(started).toContain('b');
    expect(started[0]).toBe('a');
    expect(started[1]).toBe('b');
  });

  it('is reentrant for the same file in the same async context', async () => {
    const file = '/tmp/site.json';
    const result = await withFileMutex(file, async () => {
      return withFileMutex(file, async () => 'nested');
    });
    expect(result).toBe('nested');
  });

  it('normalizes Windows paths case-insensitively', () => {
    if (process.platform !== 'win32') return;
    expect(mutexKey('C:\\Data\\Site.json')).toBe(mutexKey('c:\\data\\site.json'));
  });
});
