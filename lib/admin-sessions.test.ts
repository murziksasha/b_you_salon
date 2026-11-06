import { promises as fs } from 'fs';
import os from 'os';
import path from 'path';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import {
  isFingerprintRevoked,
  isSessionAllowed,
  listSessions,
  markFingerprintRevoked,
  registerSession,
  revokeAllSessions,
  revokeSession,
  revokeSessionsByUsername,
  sessionsFilePath,
  touchSession,
} from './admin-sessions';

describe('admin-sessions', () => {
  let tmpDir: string;
  const originalDataDir = process.env.DATA_DIR;

  beforeAll(async () => {
    tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'byou-sessions-test-'));
    process.env.DATA_DIR = tmpDir;
  });

  afterAll(async () => {
    if (originalDataDir === undefined) { delete process.env.DATA_DIR; } else { process.env.DATA_DIR = originalDataDir; }
    try {
      await fs.rm(tmpDir, { recursive: true, force: true });
    } catch {
      /* ignore */
    }
  });

  beforeEach(async () => {
    try {
      await fs.unlink(sessionsFilePath());
    } catch {
      /* ignore */
    }
  });

  it('registers and lists sessions', async () => {
    const s1 = await registerSession({
      fingerprint: 'fp-1',
      username: 'admin',
      role: 'owner',
      ip: '127.0.0.1',
      userAgent: 'Chrome',
    });

    expect(s1.id).toBeDefined();
    expect(s1.fingerprint).toBe('fp-1');
    expect(s1.username).toBe('admin');

    const list = await listSessions();
    expect(list).toHaveLength(1);
    expect(list[0].fingerprint).toBe('fp-1');
  });

  it('replaces existing session with same fingerprint', async () => {
    await registerSession({ fingerprint: 'fp-1', username: 'admin', role: 'owner' });
    await registerSession({ fingerprint: 'fp-1', username: 'admin', role: 'operator' });

    const list = await listSessions();
    expect(list).toHaveLength(1);
    expect(list[0].role).toBe('operator');
  });

  it('updates lastSeenAt with touchSession', async () => {
    const s = await registerSession({ fingerprint: 'fp-touch', username: 'admin', role: 'owner' });
    const originalTime = s.lastSeenAt;

    // Small delay to ensure timestamp changes
    await new Promise(r => setTimeout(r, 10));
    await touchSession('fp-touch');

    const list = await listSessions();
    expect(list[0].lastSeenAt).not.toBe(originalTime);
  });

  it('revokes session by id and marks fingerprint revoked', async () => {
    const s = await registerSession({ fingerprint: 'fp-target', username: 'anna', role: 'editor' });
    expect(await isSessionAllowed('fp-target')).toBe(true);

    const revoked = await revokeSession(s.id);
    expect(revoked).toBe(true);

    expect(await isSessionAllowed('fp-target')).toBe(false);
    expect(await isFingerprintRevoked('fp-target')).toBe(true);
    expect(await listSessions()).toHaveLength(0);
  });

  it('revokes all sessions except given fingerprint', async () => {
    await registerSession({ fingerprint: 'fp-keep', username: 'admin', role: 'owner' });
    await registerSession({ fingerprint: 'fp-kill-1', username: 'user1', role: 'editor' });
    await registerSession({ fingerprint: 'fp-kill-2', username: 'user2', role: 'operator' });

    const count = await revokeAllSessions('fp-keep');
    expect(count).toBe(2);

    expect(await isSessionAllowed('fp-keep')).toBe(true);
    expect(await isSessionAllowed('fp-kill-1')).toBe(false);
    expect(await isSessionAllowed('fp-kill-2')).toBe(false);

    const active = await listSessions();
    expect(active).toHaveLength(1);
    expect(active[0].fingerprint).toBe('fp-keep');
  });

  it('revokes sessions by username', async () => {
    await registerSession({ fingerprint: 'fp-u1', username: 'targetUser', role: 'editor' });
    await registerSession({ fingerprint: 'fp-u2', username: 'targetUser', role: 'editor' });
    await registerSession({ fingerprint: 'fp-u3', username: 'otherUser', role: 'operator' });

    const count = await revokeSessionsByUsername('targetuser');
    expect(count).toBe(2);

    expect(await isSessionAllowed('fp-u1')).toBe(false);
    expect(await isSessionAllowed('fp-u2')).toBe(false);
    expect(await isSessionAllowed('fp-u3')).toBe(true);
  });

  it('marks fingerprint revoked explicitly', async () => {
    await registerSession({ fingerprint: 'fp-exp', username: 'admin', role: 'owner' });
    await markFingerprintRevoked('fp-exp');

    expect(await isSessionAllowed('fp-exp')).toBe(false);
    expect(await listSessions()).toHaveLength(0);
  });

  it('fails closed when session file is missing or corrupt', async () => {
    // Missing file
    expect(await isSessionAllowed('fp-nonexistent')).toBe(false);

    // Corrupted file
    await fs.writeFile(sessionsFilePath(), '{ corrupt json ...', 'utf-8');
    expect(await isSessionAllowed('fp-corrupt')).toBe(false);
  });

  it('enforces 100-session cap and drops oldest', async () => {

    for (let i = 1; i <= 101; i++) {
      await registerSession({
        fingerprint: `fp-${i}`,
        username: `user-${i}`,
        role: 'editor',
      });
    }

    const list = await listSessions();
    expect(list).toHaveLength(100);

    // Newest is at index 0 and allowed
    expect(list[0].fingerprint).toBe('fp-101');
    expect(await isSessionAllowed('fp-101')).toBe(true);

    // Oldest (fp-1) was pushed out and is no longer allowed
    expect(await isSessionAllowed('fp-1')).toBe(false);
  }, 20_000);
});
