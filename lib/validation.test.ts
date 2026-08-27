import { describe, expect, it } from 'vitest';
import { defaultSiteData } from './default-site-data';
import { parseSiteData } from './validation';

describe('parseSiteData', () => {
  it('accepts default site data', () => {
    const result = parseSiteData(defaultSiteData);
    expect(result.success).toBe(true);
  });

  it('rejects missing settings', () => {
    const result = parseSiteData({ pages: [], goods: [] });
    expect(result.success).toBe(false);
    if (!result.success) expect(result.error.length).toBeGreaterThan(0);
  });

  it('rejects non-array pages', () => {
    const bad = { ...defaultSiteData, pages: 'nope' };
    const result = parseSiteData(bad);
    expect(result.success).toBe(false);
  });
});
