import { describe, expect, it } from 'vitest';
import { safeJsonLd } from './json-ld';

describe('safeJsonLd', () => {
  it('escapes < and > to prevent script tag injection', () => {
    const input = {
      title: 'Awesome Product</script><script>alert("pwned")</script>',
    };
    const serialized = safeJsonLd(input);
    expect(serialized).not.toContain('</script>');
    expect(serialized).not.toContain('<script>');
    expect(serialized).toContain('\\u003c/script\\u003e');
    expect(serialized).toContain('\\u003cscript\\u003e');

    // Standard JSON.parse safely deserializes the unicode escape sequences back
    const parsed = JSON.parse(serialized);
    expect(parsed.title).toBe('Awesome Product</script><script>alert("pwned")</script>');
  });

  it('escapes & and unicode line terminators', () => {
    const input = {
      html: 'A & B \u2028 \u2029',
    };
    const serialized = safeJsonLd(input);
    expect(serialized).toContain('\\u0026');
    expect(serialized).toContain('\\u2028');
    expect(serialized).toContain('\\u2029');
    expect(JSON.parse(serialized).html).toBe('A & B \u2028 \u2029');
  });
});

