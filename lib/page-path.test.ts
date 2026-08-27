import { describe, expect, it } from 'vitest';
import {
  absoluteSiteUrl,
  sanitizePagePath,
  sanitizePageTitle,
  truncateMeta,
} from './page-path';

describe('sanitizePagePath', () => {
  it('accepts normal paths and query', () => {
    expect(sanitizePagePath('/phones')).toBe('/phones');
    expect(sanitizePagePath('/shop/abc?ref=1')).toBe('/shop/abc?ref=1');
    expect(sanitizePagePath('  /contacts  ')).toBe('/contacts');
  });

  it('rejects absolute and protocol-relative URLs', () => {
    expect(sanitizePagePath('https://evil.com')).toBeUndefined();
    expect(sanitizePagePath('//evil.com/x')).toBeUndefined();
    expect(sanitizePagePath('http://example.com/a')).toBeUndefined();
  });

  it('rejects empty, non-string, and control chars', () => {
    expect(sanitizePagePath('')).toBeUndefined();
    expect(sanitizePagePath('   ')).toBeUndefined();
    expect(sanitizePagePath(null)).toBeUndefined();
    expect(sanitizePagePath(123)).toBeUndefined();
    expect(sanitizePagePath('/a\nb')).toBeUndefined();
  });

  it('rejects backslashes and truncates length', () => {
    expect(sanitizePagePath('/a\\b')).toBeUndefined();
    const long = '/' + 'x'.repeat(400);
    const out = sanitizePagePath(long);
    expect(out).toBeDefined();
    expect(out!.length).toBe(300);
  });
});

describe('sanitizePageTitle', () => {
  it('trims and truncates', () => {
    expect(sanitizePageTitle('  Hello  ')).toBe('Hello');
    expect(sanitizePageTitle('a'.repeat(200))?.length).toBe(120);
    expect(sanitizePageTitle('')).toBeUndefined();
  });
});

describe('truncateMeta', () => {
  it('truncates and drops empty', () => {
    expect(truncateMeta('  ab  ', 10)).toBe('ab');
    expect(truncateMeta('abcdef', 3)).toBe('abc');
    expect(truncateMeta('', 10)).toBeUndefined();
    expect(truncateMeta(null, 10)).toBeUndefined();
  });
});

describe('absoluteSiteUrl', () => {
  it('joins base and path', () => {
    expect(absoluteSiteUrl('/phones', 'https://example.com/')).toBe('https://example.com/phones');
    expect(absoluteSiteUrl('/x', '')).toBe('/x');
    expect(absoluteSiteUrl(undefined, 'https://x.com')).toBeUndefined();
  });
});
