import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { isPidAlive, mutexKey, withFileMutex, withProcessFileMutex, type ProcessLockData } from './file-mutex';

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

describe('withProcessFileMutex', () => {
  it('prevents first owner from releasing second owner lock (handoff test)', async () => {
    const tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'pmutex-test-'));
    const targetFile = path.join(tmpDir, 'data.json');
    const lockFile = `${targetFile}.lock`;

    let firstOwnerRan = false;

    await withProcessFileMutex(targetFile, async (lockInfo) => {
      firstOwnerRan = true;
      expect(lockInfo?.token).toBeDefined();

      // Simulate a handoff: lock is replaced with owner B token
      const ownerBPayload: ProcessLockData = {
        token: 'owner-b-token-12345',
        pid: process.pid,
        at: Date.now(),
      };
      await fs.writeFile(lockFile, JSON.stringify(ownerBPayload), 'utf-8');
    });

    expect(firstOwnerRan).toBe(true);

    // After first owner finishes its `finally`, owner B's lock MUST NOT be unlinked
    const raw = await fs.readFile(lockFile, 'utf-8');
    const data = JSON.parse(raw) as ProcessLockData;
    expect(data.token).toBe('owner-b-token-12345');

    await fs.rm(tmpDir, { recursive: true, force: true });
  });

  it('extends lock lease with active heartbeat during long execution', async () => {
    const tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'pmutex-hb-'));
    const targetFile = path.join(tmpDir, 'data.json');
    const lockFile = `${targetFile}.lock`;

    // staleMs is 600ms, execution is 400ms, heartbeat is 100ms
    const result = await withProcessFileMutex(
      targetFile,
      async () => {
        await new Promise((r) => setTimeout(r, 400));
        const stat = await fs.stat(lockFile);
        // mtime should be refreshed by heartbeat during execution
        const age = Date.now() - stat.mtimeMs;
        expect(age).toBeLessThan(350);
        return 'done';
      },
      { staleMs: 600, heartbeatIntervalMs: 100 },
    );

    expect(result).toBe('done');
    // Once finished cleanly, lock is removed
    await expect(fs.access(lockFile)).rejects.toThrow();

    await fs.rm(tmpDir, { recursive: true, force: true });
  });

  it('recovers safely from a crashed owner (dead PID)', async () => {
    const tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'pmutex-dead-'));
    const targetFile = path.join(tmpDir, 'data.json');
    const lockFile = `${targetFile}.lock`;

    // Create stale lock with dead PID
    const deadPid = 99999999;
    expect(isPidAlive(deadPid)).toBe(false);

    const stalePayload: ProcessLockData = {
      token: 'dead-owner-token',
      pid: deadPid,
      at: Date.now() - 50000,
    };
    await fs.writeFile(lockFile, JSON.stringify(stalePayload), 'utf-8');

    const result = await withProcessFileMutex(targetFile, async () => {
      return 'recovered';
    });

    expect(result).toBe('recovered');
    await expect(fs.access(lockFile)).rejects.toThrow();

    await fs.rm(tmpDir, { recursive: true, force: true });
  });
});
