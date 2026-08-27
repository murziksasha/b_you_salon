import { describe, expect, it } from 'vitest';
import { computeProcessMetrics, formatDurationSec } from './process-metrics';
import type { Lead } from './leads';

describe('process-metrics', () => {
  it('computes first-touch from audit', () => {
    const t0 = '2026-01-01T10:00:00.000Z';
    const t1 = '2026-01-01T10:15:00.000Z';
    const leads: Lead[] = [
      {
        id: '1',
        phone: '+380',
        createdAt: t0,
        source: 'callback',
        emailed: false,
        handled: false,
        status: 'called',
        audit: [
          { at: t0, action: 'created' },
          { at: t1, action: 'status', detail: 'called' },
        ],
      },
    ];
    const m = computeProcessMetrics(leads, []);
    expect(m.medianTimeToFirstTouchSec).toBe(15 * 60);
    expect(formatDurationSec(900)).toMatch(/хв/);
  });
});
