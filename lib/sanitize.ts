/**
 * Lightweight HTML sanitizer for CMS content.
 * Allows a safe subset of tags; strips scripts/events/dangerous URLs.
 */

const ALLOWED_TAGS = new Set([
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
]);

const ALLOWED_ATTRS = new Set(['href', 'class', 'target', 'rel', 'title']);

function escapeHtml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function isSafeUrl(url: string): boolean {
  const trimmed = url.trim().toLowerCase();
  if (!trimmed) return false;
  if (trimmed.startsWith('javascript:') || trimmed.startsWith('data:') || trimmed.startsWith('vbscript:')) {
    return false;
  }
  return true;
}

/** Escape plain text for safe insertion into HTML attributes or email bodies. */
export function escapeText(text: string): string {
  return escapeHtml(String(text ?? ''));
}

/**
 * Sanitize untrusted HTML. Unknown tags are stripped (content kept).
 * Dangerous attributes and event handlers are removed.
 */
export function sanitizeHtml(dirty: string | undefined | null): string {
  if (!dirty) return '';

  let html = String(dirty);

  // Remove script/style blocks entirely
  html = html.replace(/<\s*(script|style|iframe|object|embed|form)[^>]*>[\s\S]*?<\s*\/\s*\1\s*>/gi, '');
  html = html.replace(/<\s*(script|style|iframe|object|embed|form)[^>]*\/?\s*>/gi, '');

  // Parse tags
  return html.replace(/<\/?([a-zA-Z][a-zA-Z0-9]*)\b([^>]*)>/g, (match, tagName: string, attrs: string) => {
    const tag = tagName.toLowerCase();
    const isClosing = match.startsWith('</');

    if (!ALLOWED_TAGS.has(tag)) {
      return '';
    }

    if (isClosing) {
      return `</${tag}>`;
    }

    const selfClosing = tag === 'br';
    const cleanAttrs: string[] = [];

    const attrRe = /([a-zA-Z_:][-a-zA-Z0-9_:.]*)\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s>]+))/g;
    let m: RegExpExecArray | null;
    while ((m = attrRe.exec(attrs)) !== null) {
      const name = m[1].toLowerCase();
      const value = m[2] ?? m[3] ?? m[4] ?? '';

      if (name.startsWith('on')) continue;
      if (!ALLOWED_ATTRS.has(name)) continue;

      if (name === 'href' && !isSafeUrl(value)) continue;

      let finalValue = value;
      if (name === 'href' && value.trim().startsWith('//')) {
        finalValue = `https:${value}`;
      }
      if (name === 'target' && value === '_blank') {
        cleanAttrs.push('rel="noopener noreferrer"');
      }

      cleanAttrs.push(`${name}="${escapeHtml(finalValue)}"`);
    }

    const attrStr = cleanAttrs.length ? ` ${cleanAttrs.join(' ')}` : '';
    if (selfClosing) return `<${tag}${attrStr} />`;
    return `<${tag}${attrStr}>`;
  });
}
