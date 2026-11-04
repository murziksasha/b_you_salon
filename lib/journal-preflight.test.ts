import { promises as fs } from 'fs';
import os from 'os';
import path from 'path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { defaultSiteData } from './default-site-data';
import { validateJournalsDir } from './journal-preflight';

describe('journal-preflight', () => {
  let tmpDir: string;

  beforeEach(async () => {
    tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'preflight-test-'));
  });

  afterEach(async () => {
    await fs.rm(tmpDir, { recursive: true, force: true });
  });

  it('validates clean journals without errors and does not mutate files', async () => {
    const sitePath = path.join(tmpDir, 'site.json');
    const leadsPath = path.join(tmpDir, 'leads.json');
    const ordersPath = path.join(tmpDir, 'orders.json');

    const cleanSite = JSON.stringify(defaultSiteData, null, 2);
    const cleanLeads = JSON.stringify({
      leads: [
        {
          id: 'lead-1',
          phone: '+380501234567',
          createdAt: '2026-11-04T10:00:00Z',
          source: 'callback',
          emailed: true,
          handled: true,
          status: 'called',
          outcome: 'deal',
        },
      ],
    });
    const cleanOrders = JSON.stringify({
      orders: [
        {
          id: 'order-1',
          phone: '+380509876543',
          createdAt: '2026-11-04T11:00:00Z',
          source: 'shop',
          quantity: 1,
          product: { id: 'p1', title: 'Product 1', price: 150 },
          emailed: true,
          handled: false,
          status: 'new',
        },
      ],
    });

    await fs.writeFile(sitePath, cleanSite, 'utf-8');
    await fs.writeFile(leadsPath, cleanLeads, 'utf-8');
    await fs.writeFile(ordersPath, cleanOrders, 'utf-8');

    const report = await validateJournalsDir(tmpDir, { requireAll: true });
    expect(report.ok).toBe(true);
    expect(report.totalErrors).toBe(0);
    expect(report.site.valid).toBe(true);
    expect(report.leads.valid).toBe(true);
    expect(report.orders.valid).toBe(true);

    // Verify read-only guarantee: files are completely untouched
    expect(await fs.readFile(sitePath, 'utf-8')).toBe(cleanSite);
    expect(await fs.readFile(leadsPath, 'utf-8')).toBe(cleanLeads);
    expect(await fs.readFile(ordersPath, 'utf-8')).toBe(cleanOrders);
  });

  it('reports record-level errors on corrupted journals', async () => {
    const sitePath = path.join(tmpDir, 'site.json');
    const leadsPath = path.join(tmpDir, 'leads.json');
    const ordersPath = path.join(tmpDir, 'orders.json');

    await fs.writeFile(sitePath, '{ "broken": true }', 'utf-8');
    await fs.writeFile(
      leadsPath,
      JSON.stringify({
        leads: [
          {
            id: 'bad-lead-phone',
            phone: 999, // invalid type
            createdAt: '2026-11-04T10:00:00Z',
            source: 'callback',
            emailed: true,
            handled: false,
          },
        ],
      }),
      'utf-8',
    );
    await fs.writeFile(
      ordersPath,
      JSON.stringify({
        orders: [
          {
            id: 'bad-order-qty',
            phone: '+380509876543',
            createdAt: '2026-11-04T11:00:00Z',
            source: 'shop',
            quantity: 'ten', // invalid type
            product: { id: 'p1', title: 'Product 1', price: 150 },
            emailed: true,
            handled: false,
          },
        ],
      }),
      'utf-8',
    );

    const report = await validateJournalsDir(tmpDir, { requireAll: true });
    expect(report.ok).toBe(false);
    expect(report.totalErrors).toBeGreaterThan(0);

    const leadIssue = report.leads.issues.find((i) => i.recordId === 'bad-lead-phone');
    expect(leadIssue).toBeDefined();
    expect(leadIssue?.path).toBe('phone');

    const orderIssue = report.orders.issues.find((i) => i.recordId === 'bad-order-qty');
    expect(orderIssue).toBeDefined();
    expect(orderIssue?.path).toBe('quantity');
  });
});

