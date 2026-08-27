const MAX_PAGE_PATH = 300;
const MAX_PAGE_TITLE = 120;

/**
 * Sanitize a client-provided page path for safe use in emails / journal.
 * Accepts only relative paths starting with `/` (path + optional query).
 * Rejects schemes, protocol-relative URLs, and control characters.
 */
export function sanitizePagePath(raw: unknown, maxLen = MAX_PAGE_PATH): string | undefined {
  if (typeof raw !== 'string') return undefined;
  let path = raw.trim();
  if (!path) return undefined;
  if (path.length > maxLen) path = path.slice(0, maxLen);

  // Must be a same-origin relative path
  if (!path.startsWith('/')) return undefined;
  if (path.startsWith('//')) return undefined;
  if (/[\u0000-\u001f\u007f]/.test(path)) return undefined;
  // Reject anything that looks like a scheme or backslash confusion
  if (/^[a-zA-Z][a-zA-Z0-9+.-]*:/.test(path.slice(1))) return undefined;
  if (path.includes('\\')) return undefined;

  return path;
}

/** Truncate optional free-text title for mail/meta. */
export function sanitizePageTitle(raw: unknown, maxLen = MAX_PAGE_TITLE): string | undefined {
  if (typeof raw !== 'string') return undefined;
  let title = raw.replace(/[\u0000-\u001f\u007f]/g, '').trim();
  if (!title) return undefined;
  if (title.length > maxLen) title = title.slice(0, maxLen);
  return title;
}

export function truncateMeta(raw: string | null | undefined, maxLen: number): string | undefined {
  if (!raw) return undefined;
  const t = raw.replace(/[\u0000-\u001f\u007f]/g, '').trim();
  if (!t) return undefined;
  return t.length > maxLen ? t.slice(0, maxLen) : t;
}

/** Absolute URL for a sanitized relative path when SITE_URL is set. */
export function absoluteSiteUrl(pagePath: string | undefined, siteUrl: string): string | undefined {
  if (!pagePath) return undefined;
  const base = siteUrl.replace(/\/$/, '');
  if (!base) return pagePath;
  return `${base}${pagePath}`;
}
