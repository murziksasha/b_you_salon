import { describe, expect, it } from 'vitest';
import { clientIpFromHeaders, isIpAllowed } from './admin-ip';

describe('isIpAllowed', () => {
  it('allows all when allowlist empty', () => {
    expect(isIpAllowed('1.2.3.4', [])).toBe(true);
    expect(isIpAllowed('', [])).toBe(true);
  });

  it('matches exact IP', () => {
    expect(isIpAllowed('192.168.1.10', ['192.168.1.10', '127.0.0.1'])).toBe(true);
    expect(isIpAllowed('192.168.1.11', ['192.168.1.10'])).toBe(false);
  });

  it('normalizes IPv4-mapped IPv6', () => {
    expect(isIpAllowed('::ffff:192.168.1.10', ['192.168.1.10'])).toBe(true);
  });

  it('denies empty IP when allowlist set', () => {
    expect(isIpAllowed('', ['127.0.0.1'])).toBe(false);
  });
});

describe('clientIpFromHeaders', () => {
  it('reads rightmost (proxy-added) X-Forwarded-For hop to prevent client spoofing', () => {
    const h = new Headers({ 'x-forwarded-for': '10.0.0.5, 10.0.0.1' });
    expect(clientIpFromHeaders(h)).toBe('10.0.0.1');
  });

  it('prefers authoritative X-Real-IP over X-Forwarded-For', () => {
    const h = new Headers({ 'x-real-ip': '::ffff:127.0.0.1', 'x-forwarded-for': '10.0.0.5' });
    expect(clientIpFromHeaders(h)).toBe('127.0.0.1');
  });
});
