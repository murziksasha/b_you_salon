import { promises as fs } from 'fs';
import os from 'os';
import path from 'path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { appendLead, leadsFilePath, listLeads, updateLead } from './leads';
import {
  readRetentionState,
  retentionStateFilePath,
  runDailyRetention,
  writeRetentionState,
} from './retention-runner';

describe('retention-runner', () => {
  let tmpDir: string;
  let prevDataDir: string | undefined;

  beforeEach(async () => {
    tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'retention-runner-'));
    prevDataDir = process.env.DATA_DIR;
    process.env.DATA_DIR = tmpDir;
  });

  afterEach(async () => {
    if (prevDataDir === undefined) delete process.env.DATA_DIR;
    else process.env.DATA_DIR = prevDataDir;
    await fs.rm(tmpDir, { recursive: true, force: true });
  });

  it('executes purge when day was missed and records last-run marker', async () => {
    const now = new Date('2026-11-04T12:00:00Z').getTime();
    const oldDate = new Date('2025-09-01T10:00:00Z').toISOString();

    // Create an expired closed lead
    const lead = await appendLead({ phone: '+380501112233', emailed: true });
    await updateLead(lead.id, { handled: true, status: 'done' });
    const raw = JSON.parse(await fs.readFile(leadsFilePath(), 'utf-8'));
    raw.leads[0].handledAt = oldDate;
    await fs.writeFile(leadsFilePath(), JSON.stringify(raw), 'utf-8');

    // State from 2 days ago
    await writeRetentionState({
      lastRunDate: '2026-11-02',
      lastRunAt: '2026-11-02T10:00:00.000Z',
      leadsPurged: 0,
      ordersPurged: 0,
      ok: true,
    });

    const result = await runDailyRetention({ now });
    expect(result.executed).toBe(true);
    expect(result.leadsPurged).toBe(1);
    expect(result.backupPath).toBeTruthy();

    const state = await readRetentionState();
    expect(state?.lastRunDate).toBe('2026-11-04');
    expect(state?.leadsPurged).toBe(1);

    const leadsAfter = await listLeads();
    expect(leadsAfter.length).toBe(0);
  });

  it('skips execution on repeated runs on the same calendar day unless forced', async () => {
    const now = new Date('2026-11-04T12:00:00Z').getTime();

    // Mark as already run today
    await writeRetentionState({
      lastRunDate: '2026-11-04',
      lastRunAt: '2026-11-04T08:00:00.000Z',
      leadsPurged: 0,
      ordersPurged: 0,
      ok: true,
    });

    const result = await runDailyRetention({ now });
    expect(result.executed).toBe(false);
    expect(result.skippedReason).toBe('already_run_today');

    // Force run executes anyway
    const forced = await runDailyRetention({ now, force: true });
    expect(forced.executed).toBe(true);
  });

  it('evaluates dry-run without taking backups or modifying records', async () => {
    const now = new Date('2026-11-04T12:00:00Z').getTime();
    const oldDate = new Date('2025-09-01T10:00:00Z').toISOString();

    const lead = await appendLead({ phone: '+380501112233', emailed: true });
    await updateLead(lead.id, { handled: true, status: 'done' });
    const raw = JSON.parse(await fs.readFile(leadsFilePath(), 'utf-8'));
    raw.leads[0].handledAt = oldDate;
    await fs.writeFile(leadsFilePath(), JSON.stringify(raw), 'utf-8');

    const result = await runDailyRetention({ now, dryRun: true });
    expect(result.executed).toBe(true);
    expect(result.dryRun).toBe(true);
    expect(result.leadsPurged).toBe(1);
    expect(result.backupPath).toBeUndefined();

    // Lead should still exist
    const leadsAfter = await listLeads();
    expect(leadsAfter.length).toBe(1);

    // Retention state should NOT be written for dry-run
    const state = await readRetentionState();
    expect(state).toBeNull();
  });

  it('aborts purge when backup gate fails (failure injection)', async () => {
    const now = new Date('2026-11-04T12:00:00Z').getTime();
    const oldDate = new Date('2025-09-01T10:00:00Z').toISOString();

    const lead = await appendLead({ phone: '+380501112233', emailed: true });
    await updateLead(lead.id, { handled: true, status: 'done' });
    const raw = JSON.parse(await fs.readFile(leadsFilePath(), 'utf-8'));
    raw.leads[0].handledAt = oldDate;
    await fs.writeFile(leadsFilePath(), JSON.stringify(raw), 'utf-8');

    const failingBackupGate = async () => {
      throw new Error('Injected filesystem write error during backup');
    };

    const result = await runDailyRetention({ now, backupGateFn: failingBackupGate });
    expect(result.executed).toBe(false);
    expect(result.skippedReason).toBe('backup_failed');
    expect(result.error).toContain('Injected filesystem write error');

    // Safe closed: lead is NOT purged
    const leadsAfter = await listLeads();
    expect(leadsAfter.length).toBe(1);
    expect(leadsAfter[0].id).toBe(lead.id);

    // State not marked as clean today
    const state = await readRetentionState();
    expect(state).toBeNull();
  });
});
