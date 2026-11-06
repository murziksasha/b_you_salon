import { describe, expect, it } from 'vitest';
import { getHealthReport, getPublicHealth } from './health';

describe('health probes', () => {
  it('getPublicHealth returns minimal probe without filesystem paths', async () => {
    const pub = await getPublicHealth();
    expect(pub).toHaveProperty('ok');
    expect(pub).toHaveProperty('service', 'byou');
    expect(pub).toHaveProperty('time');
    expect(pub).toHaveProperty('uptimeSec');
    expect(pub).not.toHaveProperty('dataDir');
  });

  it('getHealthReport does not leak dataDir filesystem path', async () => {
    const report = await getHealthReport();
    expect(report).toHaveProperty('ok');
    expect(report).toHaveProperty('service', 'byou');
    expect(report).not.toHaveProperty('dataDir');
  });
});

