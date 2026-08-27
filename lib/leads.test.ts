import { promises as fs } from 'fs';
import os from 'os';
import path from 'path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

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
});
