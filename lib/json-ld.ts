/**
 * Safely serialize data for <script type="application/ld+json">.
 * Escapes characters that could break out of HTML script tags (<, >, &, \u2028, \u2029)
 * preventing stored XSS when CMS or user content is rendered inside JSON-LD.
 */
export function safeJsonLd(data: unknown): string {
  const json = JSON.stringify(data);
  return json
    .replace(/</g, '\\u003c')
    .replace(/>/g, '\\u003e')
    .replace(/&/g, '\\u0026')
    .replace(/\u2028/g, '\\u2028')
    .replace(/\u2029/g, '\\u2029');
}

