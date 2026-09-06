import sanitizeHtmlLib from 'sanitize-html';

const ALLOWED_TAGS = [
  'b',
  'strong',
  'i',
  'em',
  'br',
  'span',
  'p',
  'a',
  'ul',
  'ol',
  'li',
  'h1',
  'h2',
  'h3',
  'h4',
  'div',
  'small',
  'u',
];

function escapeHtml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

/** Strip whitespace/control chars then reject dangerous URL schemes. */
export function isSafeUrl(url: string): boolean {
  const stripped = String(url || '')
    .replace(/[\s\x00-\x1f\x7f]/g, '')
    .toLowerCase();
  if (!stripped) return false;
  if (stripped.startsWith('javascript:') || stripped.startsWith('data:') || stripped.startsWith('vbscript:')) {
    return false;
  }
  if (/^[a-z][a-z0-9+.-]*:/i.test(stripped)) {
    return (
      stripped.startsWith('http:') ||
      stripped.startsWith('https:') ||
      stripped.startsWith('mailto:') ||
      stripped.startsWith('tel:')
    );
  }
  return true;
}

function normalizeHref(href: string): string | undefined {
  const trimmed = href.trim();
  const withScheme = trimmed.startsWith('//') ? `https:${trimmed}` : trimmed;
  return isSafeUrl(withScheme) ? withScheme : undefined;
}

const SANITIZE_OPTIONS: sanitizeHtmlLib.IOptions = {
  allowedTags: ALLOWED_TAGS,
  allowedAttributes: {
    '*': ['class', 'title'],
    a: ['href', 'target', 'rel'],
  },
  allowedSchemes: ['http', 'https', 'mailto', 'tel'],
  allowedSchemesByTag: {
    a: ['http', 'https', 'mailto', 'tel'],
  },
  allowProtocolRelative: false,
  disallowedTagsMode: 'discard',
  transformTags: {
    a: (_tagName, attribs) => {
      const href = attribs.href ? normalizeHref(attribs.href) : undefined;
      const next: Record<string, string> = {};
      if (attribs.class) next.class = attribs.class;
      if (attribs.title) next.title = attribs.title;
      if (href) next.href = href;
      if (attribs.target === '_blank') {
        next.target = '_blank';
        next.rel = 'noopener noreferrer';
      } else if (attribs.rel) {
        next.rel = attribs.rel;
      }
      return { tagName: 'a', attribs: next };
    },
  },
};

/** Escape plain text for safe insertion into HTML attributes or email bodies. */
export function escapeText(text: string): string {
  return escapeHtml(String(text ?? ''));
}

/**
 * Sanitize untrusted HTML with sanitize-html (entity decoding, scheme checks).
 * Unknown tags are stripped (text content kept). Event handlers are removed.
 */
export function sanitizeHtml(dirty: string | undefined | null): string {
  if (!dirty) return '';
  return sanitizeHtmlLib(String(dirty), SANITIZE_OPTIONS);
}
