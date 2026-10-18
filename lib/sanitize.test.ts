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

  it('blocks entity-encoded javascript: and vbscript: urls', () => {
    expect(sanitizeHtml('<a href="&#106;avascript:alert(1)">x</a>')).not.toContain('javascript');
    expect(sanitizeHtml('<a href="java&#x09;script:alert(1)">x</a>')).not.toContain('javascript');
    expect(sanitizeHtml('<a href="vbscript:msgbox(1)">x</a>')).not.toContain('vbscript');
    expect(sanitizeHtml('<a href="data:text/html;base64,PHNjcmlwdD5hbGVydCgxKTwvc2NyaXB0Pg==">x</a>')).not.toContain(
      'data:',
    );
  });

  it('handles empty input', () => {
    expect(sanitizeHtml('')).toBe('');
    expect(sanitizeHtml(null)).toBe('');
    expect(sanitizeHtml(undefined)).toBe('');
  });

  it('strips img onerror and nested svg/script', () => {
    const html = sanitizeHtml('<img src=x onerror="alert(1)"><svg><script>alert(1)</script></svg>ok');
    expect(html).not.toMatch(/onerror/i);
    expect(html).not.toMatch(/<script/i);
    expect(html).not.toMatch(/<svg/i);
    expect(html).toContain('ok');
  });

  it('adds noopener on target=_blank and upgrades protocol-relative href', () => {
    const html = sanitizeHtml('<a href="//example.com" target="_blank">x</a>');
    expect(html).toContain('https://example.com');
    expect(html).toContain('rel="noopener noreferrer"');
  });
});

describe('escapeText', () => {
  it('escapes HTML special chars', () => {
    expect(escapeText('<script>"&\'')).toBe('&lt;script&gt;&quot;&amp;&#39;');
  });
});
