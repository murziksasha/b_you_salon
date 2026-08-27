import { describe, expect, it } from 'vitest';
import { formatUtmLine, parseUtmFromPagePath } from './utm';

describe('utm', () => {
  it('parses from page path query', () => {
    const u = parseUtmFromPagePath('/phones?utm_source=fb&utm_medium=cpc&utm_campaign=spring');
    expect(u.utmSource).toBe('fb');
    expect(u.utmMedium).toBe('cpc');
    expect(u.utmCampaign).toBe('spring');
    expect(formatUtmLine(u)).toContain('source=fb');
  });

  it('handles missing query', () => {
    expect(parseUtmFromPagePath('/phones')).toEqual({});
  });
});
