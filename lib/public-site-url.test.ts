import { describe, expect, it } from 'vitest';
import {
  absoluteUrl,
  isLocalhostOrigin,
  originFromEnv,
  originFromHeaders,
  resolvePublicSiteUrl,
} from './public-site-url';

describe('isLocalhostOrigin', () => {
  it('detects loopback hosts', () => {
    expect(isLocalhostOrigin('http://localhost:3000')).toBe(true);
    expect(isLocalhostOrigin('http://127.0.0.1')).toBe(true);
    expect(isLocalhostOrigin('127.0.0.1:3000')).toBe(true);
    expect(isLocalhostOrigin('localhost:8080')).toBe(true);
  });

  it('allows public hosts', () => {
    expect(isLocalhostOrigin('https://beyou.properservice.keenetic.pro')).toBe(false);
    expect(isLocalhostOrigin('beyou.properservice.keenetic.pro')).toBe(false);
  });
});

describe('originFromEnv', () => {
  it('ignores missing and localhost', () => {
    expect(originFromEnv({})).toBeUndefined();
    expect(originFromEnv({ SITE_URL: 'http://localhost:3000' })).toBeUndefined();
  });

  it('returns stripped public origin', () => {
    expect(
      originFromEnv({ SITE_URL: 'https://beyou.properservice.keenetic.pro/' }),
    ).toBe('https://beyou.properservice.keenetic.pro');
  });
});

describe('resolvePublicSiteUrl', () => {
  it('prefers public env over request host', () => {
    const h = new Headers({ host: 'example.local' });
    expect(
      resolvePublicSiteUrl(h, {
        SITE_URL: 'https://beyou.properservice.keenetic.pro',
      }),
    ).toBe('https://beyou.properservice.keenetic.pro');
  });

  it('falls back to forwarded host when env is localhost', () => {
    const h = new Headers({
      'x-forwarded-host': 'beyou.properservice.keenetic.pro',
      'x-forwarded-proto': 'https',
    });
    expect(
      resolvePublicSiteUrl(h, { SITE_URL: 'http://localhost:3000' }),
    ).toBe('https://beyou.properservice.keenetic.pro');
  });
});

describe('originFromHeaders', () => {
  it('defaults proto to https for public hosts', () => {
    const h = new Headers({ host: 'beyou.properservice.keenetic.pro' });
    expect(originFromHeaders(h)).toBe('https://beyou.properservice.keenetic.pro');
  });

  it('keeps https even if proxy forwarded http', () => {
    const h = new Headers({
      host: 'beyou.properservice.keenetic.pro',
      'x-forwarded-proto': 'http',
    });
    expect(originFromHeaders(h)).toBe('https://beyou.properservice.keenetic.pro');
  });
});

describe('absoluteUrl', () => {
  it('joins path to origin', () => {
    expect(absoluteUrl('/salon', 'https://ex.com')).toBe('https://ex.com/salon');
    expect(absoluteUrl('/', 'https://ex.com')).toBe('https://ex.com/');
  });
});
