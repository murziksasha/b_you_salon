import { promises as fs } from 'fs';
import os from 'os';
import path from 'path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { leadsFilePath, purgeExpiredLeads } from './leads';
import { CLOSE_OUTCOMES, WORKFLOW_STATUSES } from './workflow';

describe('leads store', () => {
  let tmpDir: string;
  let prev: string | undefined;

  beforeEach(async () => {
    tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'ps-leads-'));
    prev = process.env.DATA_DIR;
    process.env.DATA_DIR = tmpDir;
  });

  afterEach(async () => {
    if (prev === undefined) delete process.env.DATA_DIR;
    else process.env.DATA_DIR = prev;
    await fs.rm(tmpDir, { recursive: true, force: true });
  });

  it('appends, updates, deletes leads', async () => {
    const { appendLead, listLeads, updateLead, deleteLead, countLeads } = await import('./leads');

    const a = await appendLead({
      phone: '+380501112233',
      emailed: false,
      pagePath: '/phones',
    });
    expect(a.id).toBeTruthy();
    expect(a.pagePath).toBe('/phones');
    expect(a.emailed).toBe(false);
    expect(await countLeads({ unhandledOnly: true })).toBe(1);

    const marked = await updateLead(a.id, { emailed: true });
    expect(marked?.emailed).toBe(true);

    const updated = await updateLead(a.id, { handled: true, note: 'called' });
    expect(updated?.handled).toBe(true);
    expect(updated?.note).toBe('called');
    expect(updated?.emailed).toBe(true);
    expect(await countLeads({ unhandledOnly: true })).toBe(0);

    const list = await listLeads();
    expect(list).toHaveLength(1);
    expect(list[0].pagePath).toBe('/phones');

    expect(await deleteLead(a.id)).toBe(true);
    expect(await listLeads()).toHaveLength(0);
  });

  it('keeps both leads when two appends run concurrently', async () => {
    const { appendLead, listLeads } = await import('./leads');
    await Promise.all([
      appendLead({ phone: '+380501111111', emailed: false }),
      appendLead({ phone: '+380502222222', emailed: false }),
    ]);
    const list = await listLeads();
    expect(list).toHaveLength(2);
    const phones = list.map(l => l.phone).sort();
    expect(phones).toEqual(['+380501111111', '+380502222222']);
  });

  it('propagates error on corrupt JSON and preserves file', async () => {
    const { listLeads } = await import('./leads');
    await fs.writeFile(leadsFilePath(), '{ bad json leads ...', 'utf-8');
    await expect(listLeads()).rejects.toThrow();
    const content = await fs.readFile(leadsFilePath(), 'utf-8');
    expect(content).toBe('{ bad json leads ...');
  });

  it('purges only closed leads older than 12 months with handledAt', async () => {
    const { appendLead, updateLead, listLeads } = await import('./leads');
    const now = new Date('2026-11-04T12:00:00Z').getTime();

    // 1. Handled 14 months ago -> SHOULD BE PURGED
    const l1 = await appendLead({ phone: '+380500000001', emailed: false });
    await updateLead(l1.id, { handled: true });
    // Manually set old handledAt
    const raw = JSON.parse(await fs.readFile(leadsFilePath(), 'utf-8'));
    const old14m = new Date(now - 14 * 30 * 24 * 3600 * 1000).toISOString();
    const recent6m = new Date(now - 6 * 30 * 24 * 3600 * 1000).toISOString();
    raw.leads[0].handledAt = old14m;
    raw.leads[0].status = 'done';

    // 2. Handled 6 months ago -> RETAINED
    raw.leads.push({
      id: 'lead-recent',
      phone: '+380500000002',
      createdAt: recent6m,
      source: 'callback',
      emailed: true,
      handled: true,
      status: 'done',
      handledAt: recent6m,
    });

    // 3. Open lead from 14 months ago -> RETAINED
    raw.leads.push({
      id: 'lead-open-old',
      phone: '+380500000003',
      createdAt: old14m,
      source: 'booking',
      emailed: true,
      handled: false,
      status: 'new',
    });

    // 4. Closed lead without handledAt (legacy) -> RETAINED
    raw.leads.push({
      id: 'lead-legacy-undated',
      phone: '+380500000004',
      createdAt: old14m,
      source: 'callback',
      emailed: true,
      handled: true,
      status: 'done',
    });

    // 5. no_answer status -> RETAINED
    raw.leads.push({
      id: 'lead-no-answer',
      phone: '+380500000005',
      createdAt: old14m,
      source: 'callback',
      emailed: true,
      handled: true,
      status: 'no_answer',
      handledAt: old14m,
    });

    await fs.writeFile(leadsFilePath(), JSON.stringify(raw), 'utf-8');

    const result = await purgeExpiredLeads(now);
    expect(result.purgedCount).toBe(1);
    expect(result.retainedCount).toBe(4);
    expect(result.undatedLegacyCount).toBe(1);

    const after = await listLeads();
    const ids = after.map(l => l.id);
    expect(ids).not.toContain(l1.id);
    expect(ids).toContain('lead-recent');
    expect(ids).toContain('lead-open-old');
    expect(ids).toContain('lead-legacy-undated');
    expect(ids).toContain('lead-no-answer');
  });

  it('parses and saves every workflow status and close outcome', async () => {
    const { appendLead, updateLead, listLeads } = await import('./leads');

    for (const status of WORKFLOW_STATUSES) {
      const lead = await appendLead({ phone: '+380501110001', emailed: false });
      const updated = await updateLead(lead.id, { status });
      expect(updated?.status).toBe(status);
    }

    for (const outcome of CLOSE_OUTCOMES) {
      const lead = await appendLead({ phone: '+380501110002', emailed: false });
      const updated = await updateLead(lead.id, { outcome, status: 'done' });
      expect(updated?.outcome).toBe(outcome);
    }

    const all = await listLeads();
    expect(all.length).toBe(WORKFLOW_STATUSES.length + CLOSE_OUTCOMES.length);
  });

  it('preserves historical unknown fields during round-trip', async () => {
    const { updateLead, listLeads } = await import('./leads');
    const legacyFixture = {
      leads: [
        {
          id: 'lead-legacy-fields',
          phone: '+380509998877',
          createdAt: new Date().toISOString(),
          source: 'callback',
          emailed: false,
          handled: false,
          status: 'new',
          legacyTrackingId: 'track-999',
          clientMetadata: { sourceApp: 'legacy-v1', ip: '192.168.1.1' },
        },
      ],
    };
    await fs.writeFile(leadsFilePath(), JSON.stringify(legacyFixture), 'utf-8');

    await updateLead('lead-legacy-fields', { note: 'updated note' });
    const stored = JSON.parse(await fs.readFile(leadsFilePath(), 'utf-8'));
    expect(stored.leads[0].legacyTrackingId).toBe('track-999');
    expect(stored.leads[0].clientMetadata).toEqual({ sourceApp: 'legacy-v1', ip: '192.168.1.1' });
    expect(stored.leads[0].note).toBe('updated note');
  });

  it('fails closed with actionable error on corrupt record types', async () => {
    const { listLeads } = await import('./leads');
    const corruptedFixture = {
      leads: [
        {
          id: 'corrupted-lead',
          phone: 12345, // invalid type: number instead of string
          createdAt: new Date().toISOString(),
          source: 'callback',
          emailed: false,
          handled: false,
        },
      ],
    };
    await fs.writeFile(leadsFilePath(), JSON.stringify(corruptedFixture), 'utf-8');
    await expect(listLeads()).rejects.toThrow(/Corrupted or invalid leads store/);
  });

  it('rejects unknown source instead of silently defaulting', async () => {
    const { listLeads } = await import('./leads');
    const badSourceFixture = {
      leads: [
        {
          id: 'bad-source-lead',
          phone: '+380501112233',
          createdAt: new Date().toISOString(),
          source: 'unknown_source_value',
          emailed: false,
          handled: false,
        },
      ],
    };
    await fs.writeFile(leadsFilePath(), JSON.stringify(badSourceFixture), 'utf-8');
    await expect(listLeads()).rejects.toThrow(/Corrupted or invalid leads store/);
  });
});
