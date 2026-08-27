import { describe, expect, it } from 'vitest';
import { escapeText, sanitizeHtml } from './sanitize';

describe('sanitizeHtml', () => {
  it('allows safe tags', () => {
    const html = sanitizeHtml('<b>bold</b> and <span class="x">span</span>');
    expect(html).toContain('<b>bold</b>');
    expect(html).toContain('<span class="x">span</span>');
  });

  it('strips script tags', () => {
    const html = sanitizeHtml('hi<script>alert(1)</script>there');
    expect(html).not.toContain('script');
    expect(html).toContain('hi');
    expect(html).toContain('there');
  });

  it('strips event handlers', () => {
    const html = sanitizeHtml('<a href="/ok" onclick="alert(1)">x</a>');
    expect(html).toContain('href="/ok"');
    expect(html).not.toContain('onclick');
  });

  it('blocks javascript: urls', () => {
    const html = sanitizeHtml('<a href="javascript:alert(1)">x</a>');
    expect(html).not.toContain('javascript');
  });

  it('handles empty input', () => {
    expect(sanitizeHtml('')).toBe('');
    expect(sanitizeHtml(null)).toBe('');
    expect(sanitizeHtml(undefined)).toBe('');
  });
});

describe('escapeText', () => {
  it('escapes HTML special chars', () => {
    expect(escapeText('<script>"&\'')).toBe('&lt;script&gt;&quot;&amp;&#39;');
  });
});
