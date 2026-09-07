import { describe, expect, it } from 'vitest';
import { CONTENT_SECURITY_POLICY, SECURITY_HEADERS } from './csp';

describe('CSP', () => {
  it('blocks object/embed, base hijack, and inline event handlers', () => {
    expect(CONTENT_SECURITY_POLICY).toContain("object-src 'none'");
    expect(CONTENT_SECURITY_POLICY).toContain("base-uri 'self'");
    expect(CONTENT_SECURITY_POLICY).toContain("script-src-attr 'none'");
    expect(CONTENT_SECURITY_POLICY).toContain("frame-ancestors 'self'");
  });

  it('exposes CSP on the shared security header list', () => {
    const csp = SECURITY_HEADERS.find(h => h.key === 'Content-Security-Policy');
    expect(csp?.value).toBe(CONTENT_SECURITY_POLICY);
  });

  it('allows webpack eval only outside production', () => {
    if (process.env.NODE_ENV === 'production') {
      expect(CONTENT_SECURITY_POLICY).not.toContain('unsafe-eval');
    } else {
      expect(CONTENT_SECURITY_POLICY).toContain('unsafe-eval');
    }
    expect(CONTENT_SECURITY_POLICY).toContain("script-src 'self' 'unsafe-inline'");
  });
});
