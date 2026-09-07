import { describe, expect, it } from 'vitest';
import { defaultSiteData } from './default-site-data';
import {
  leadPatchBodySchema,
  mediaPatchBodySchema,
  parseOrError,
  parseSiteData,
  previewPostBodySchema,
} from './validation';

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

  it('strips unknown settings keys (no passthrough)', () => {
    const result = parseSiteData({
      ...defaultSiteData,
      settings: { ...defaultSiteData.settings, injected: '<script>' },
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect('injected' in result.data.settings).toBe(false);
    }
  });

  it('rejects overlong product titles', () => {
    const goods = [{ ...defaultSiteData.goods[0], title: 'x'.repeat(400) }];
    const result = parseSiteData({ ...defaultSiteData, goods });
    expect(result.success).toBe(false);
  });
});

describe('patch / preview schemas', () => {
  it('caps lead notes and requires ISO callbackAt', () => {
    expect(parseOrError(leadPatchBodySchema, { id: '1', note: 'x'.repeat(4001) }).success).toBe(false);
    expect(parseOrError(leadPatchBodySchema, { id: '1', callbackAt: 'tomorrow' }).success).toBe(false);
    expect(parseOrError(leadPatchBodySchema, { id: '1', callbackAt: '2026-09-06T10:00:00.000Z' }).success).toBe(true);
  });

  it('caps media alt and tags', () => {
    expect(parseOrError(mediaPatchBodySchema, { name: 'a.jpg', alt: 'x'.repeat(301) }).success).toBe(false);
    expect(parseOrError(mediaPatchBodySchema, { name: 'a.jpg', alt: 'ok', tags: ['a', 'b'] }).success).toBe(true);
  });

  it('requires a full page object for preview', () => {
    expect(parseOrError(previewPostBodySchema, { page: { id: 'only' } }).success).toBe(false);
    expect(
      parseOrError(previewPostBodySchema, {
        page: {
          id: 'p1',
          slug: 'x',
          title: 'T',
          description: 'd',
          visible: true,
          sections: [],
        },
      }).success,
    ).toBe(true);
  });
});
