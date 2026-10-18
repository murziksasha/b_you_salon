import { describe, expect, it } from 'vitest';
import { formatUtmLine, mergeUtm, parseUtmFromBody, parseUtmFromPagePath, type UtmParams } from './utm';

describe('utm', () => {
  describe('parseUtmFromPagePath', () => {
    it('parses from page path query', () => {
      const u = parseUtmFromPagePath(
        '/phones?utm_source=fb&utm_medium=cpc&utm_campaign=spring&utm_content=banner&utm_term=cosmetics',
      );
      expect(u.utmSource).toBe('fb');
      expect(u.utmMedium).toBe('cpc');
      expect(u.utmCampaign).toBe('spring');
      expect(u.utmContent).toBe('banner');
      expect(u.utmTerm).toBe('cosmetics');
      expect(formatUtmLine(u)).toBe('source=fb · medium=cpc · campaign=spring · content=banner · term=cosmetics');
    });

    it('handles missing or invalid query', () => {
      expect(parseUtmFromPagePath('/phones')).toEqual({});
      expect(parseUtmFromPagePath(undefined)).toEqual({});
    });
  });

  describe('parseUtmFromBody', () => {
    it('parses camelCase fields', () => {
      const u = parseUtmFromBody({
        utmSource: 'google',
        utmMedium: 'search',
        utmCampaign: 'promo',
      });
      expect(u.utmSource).toBe('google');
      expect(u.utmMedium).toBe('search');
      expect(u.utmCampaign).toBe('promo');
    });

    it('parses snake_case fields as fallback', () => {
      const u = parseUtmFromBody({
        utm_source: 'instagram',
        utm_medium: 'bio',
        utm_campaign: 'spring_sale',
        utm_content: 'link1',
        utm_term: 'skincare',
      });
      expect(u.utmSource).toBe('instagram');
      expect(u.utmMedium).toBe('bio');
      expect(u.utmCampaign).toBe('spring_sale');
      expect(u.utmContent).toBe('link1');
      expect(u.utmTerm).toBe('skincare');
    });

    it('ignores non-string or whitespace-only fields', () => {
      const u = parseUtmFromBody({
        utmSource: 123,
        utmMedium: '   ',
      });
      expect(u.utmSource).toBeUndefined();
      expect(u.utmMedium).toBeUndefined();
    });
  });

  describe('mergeUtm', () => {
    it('merges two UTM objects prioritizing first over second', () => {
      const a: UtmParams = { utmSource: 'direct', utmCampaign: 'c1' };
      const b: UtmParams = { utmSource: 'fallback', utmMedium: 'email', utmCampaign: 'c2' };

      const merged = mergeUtm(a, b);
      expect(merged.utmSource).toBe('direct');
      expect(merged.utmMedium).toBe('email');
      expect(merged.utmCampaign).toBe('c1');
    });
  });

  describe('formatUtmLine', () => {
    it('returns dash when all params empty', () => {
      expect(formatUtmLine({})).toBe('—');
    });

    it('formats partial params properly', () => {
      expect(formatUtmLine({ utmSource: 'tg' })).toBe('source=tg');
    });
  });
});
