import { promises as fs } from 'fs';
import os from 'os';
import path from 'path';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { listPriceHistory, priceHistoryPath, recordPriceChange } from './price-history';

describe('price-history', () => {
  let tmpDir: string;
  const originalDataDir = process.env.DATA_DIR;

  beforeAll(async () => {
    tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'byou-price-test-'));
    process.env.DATA_DIR = tmpDir;
  });

  afterAll(async () => {
    process.env.DATA_DIR = originalDataDir;
    try {
      await fs.rm(tmpDir, { recursive: true, force: true });
    } catch {
      /* ignore */
    }
  });

  beforeEach(async () => {
    try {
      await fs.unlink(priceHistoryPath());
    } catch {
      /* ignore */
    }
  });

  it('records price change when price changed', async () => {
    await recordPriceChange({
      productId: 'p1',
      price: 200,
      title: 'Serum',
      prevPrice: 150,
    });

    const history = await listPriceHistory('p1');
    expect(history).toHaveLength(1);
    expect(history[0].productId).toBe('p1');
    expect(history[0].price).toBe(200);
    expect(history[0].title).toBe('Serum');
    expect(history[0].at).toBeDefined();
  });

  it('skips recording if prevPrice === price', async () => {
    await recordPriceChange({
      productId: 'p1',
      price: 200,
      prevPrice: 200,
    });

    const history = await listPriceHistory('p1');
    expect(history).toHaveLength(0);
  });

  it('filters by productId and enforces limit', async () => {
    await recordPriceChange({ productId: 'p1', price: 100 });
    await recordPriceChange({ productId: 'p2', price: 200 });
    await recordPriceChange({ productId: 'p1', price: 120 });

    const p1History = await listPriceHistory('p1');
    expect(p1History).toHaveLength(2);
    expect(p1History.map(h => h.price)).toEqual([120, 100]);

    const allHistoryLimited = await listPriceHistory(undefined, 2);
    expect(allHistoryLimited).toHaveLength(2);

    const minLimit = await listPriceHistory(undefined, 0);
    expect(minLimit).toHaveLength(1); // Math.max(1, ...)
  });

  it('handles missing or corrupted file gracefully', async () => {
    await fs.writeFile(priceHistoryPath(), 'invalid json{', 'utf-8');
    const history = await listPriceHistory();
    expect(history).toEqual([]);
  });
});
