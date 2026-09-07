import { describe, expect, it } from 'vitest';
import {
  CONSENT_STORAGE_KEY,
  CONSENT_VERSION,
  consentReturnPath,
  cookieSetString,
  makeConsent,
  parseConsent,
  readConsentFromCookieHeader,
  serializeConsent,
  serializeConsentCookie,
} from './cookie-consent';

describe('cookie-consent', () => {
  it('parses compact cookie values', () => {
    expect(parseConsent('v1.all')).toEqual({ v: 1, choice: 'all', at: '' });
    expect(parseConsent('v1.necessary')).toEqual({ v: 1, choice: 'necessary', at: '' });
  });

  it('parses JSON localStorage payload', () => {
    const raw = serializeConsent(makeConsent('all', '2026-01-01T00:00:00.000Z'));
    expect(parseConsent(raw)).toEqual({
      v: CONSENT_VERSION,
      choice: 'all',
      at: '2026-01-01T00:00:00.000Z',
    });
  });

  it('treats version mismatch and junk as unset', () => {
    expect(parseConsent('v2.all')).toBeNull();
    expect(parseConsent('{"v":2,"choice":"all"}')).toBeNull();
    expect(parseConsent('{"v":1,"choice":"maybe"}')).toBeNull();
    expect(parseConsent('not-json')).toBeNull();
    expect(parseConsent('')).toBeNull();
    expect(parseConsent(null)).toBeNull();
  });

  it('round-trips compact cookie header', () => {
    const consent = makeConsent('necessary', '2026-02-02T00:00:00.000Z');
    expect(serializeConsentCookie(consent)).toBe('v1.necessary');
    const set = cookieSetString(consent);
    expect(set).toContain(`${CONSENT_STORAGE_KEY}=`);
    expect(set).toContain('Path=/');
    expect(set).toContain('SameSite=Lax');
    expect(set).not.toContain('Secure');
    expect(set).not.toContain('HttpOnly');
    expect(readConsentFromCookieHeader(set)).toEqual({ v: 1, choice: 'necessary', at: '' });
    expect(readConsentFromCookieHeader(`${CONSENT_STORAGE_KEY}=v1.all; other=1`)).toEqual({
      v: 1,
      choice: 'all',
      at: '',
    });
  });

  it('sanitizes consent return path', () => {
    expect(consentReturnPath('/salon')).toBe('/salon');
    expect(consentReturnPath('/shop?q=1')).toBe('/shop?q=1');
    expect(consentReturnPath('https://evil.test/phish')).toBe('/phish');
    expect(consentReturnPath('//evil.test')).toBe('/');
    expect(consentReturnPath('')).toBe('/');
  });
});
