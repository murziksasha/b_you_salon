import { XMLParser } from 'fast-xml-parser';
import sanitizeHtmlLib from 'sanitize-html';

export interface FeedProduct {
  sku: string;
  name: string;
  description: string;
  /** Sale / display price (special or price_red). */
  price: number;
  /** RRP / original price (price), if higher than sale price. */
  rrp?: number;
  thumbUrl: string;
  weight?: string;
  netVolume?: string;
  unit?: string;
  quantity?: string;
}

// ---------------------------------------------------------------------------
// HTML Cleaning Helpers
// ---------------------------------------------------------------------------

export function decodeHtmlEntities(str: string): string {
  let prev = '';
  let curr = str;
  for (let i = 0; i < 3 && prev !== curr; i++) {
    prev = curr;
    curr = curr
      .replace(/&lt;/gi, '<')
      .replace(/&gt;/gi, '>')
      .replace(/&quot;/gi, '"')
      .replace(/&#0?39;/gi, "'")
      .replace(/&apos;/gi, "'")
      .replace(/&amp;/gi, '&');
  }
  return curr;
}

export function cleanFeedDescription(raw: unknown): string {
  if (!raw) return '';
  let str = typeof raw === 'string' ? raw : String(raw);
  str = str.trim();
  if (!str) return '';

  if (
    str.includes('&lt;') ||
    str.includes('&gt;') ||
    str.includes('&quot;') ||
    str.includes('&#039;') ||
    str.includes('&apos;') ||
    str.includes('&amp;')
  ) {
    str = decodeHtmlEntities(str);
  }

  // If no HTML tags present, return cleaned string
  if (!str.includes('<') && !str.includes('>')) {
    return str;
  }

  // Strip head, style, script and their contents
  str = str.replace(/<head[^>]*>[\s\S]*?<\/head>/gi, '');
  str = str.replace(/<style[^>]*>[\s\S]*?<\/style>/gi, '');
  str = str.replace(/<script[^>]*>[\s\S]*?<\/script>/gi, '');

  const cleaned = sanitizeHtmlLib(str, {
    allowedTags: ['p', 'b', 'strong', 'i', 'em', 'br', 'ul', 'ol', 'li', 'span'],
    allowedAttributes: {},
    nonTextTags: ['style', 'script', 'textarea', 'option', 'noscript', 'head'],
  }).trim();

  return cleaned;
}

export function stripHtmlToPlainText(raw: string | undefined | null): string {
  if (!raw) return '';
  let str = String(raw).trim();
  if (!str) return '';
  if (str.includes('&lt;') || str.includes('&gt;')) {
    str = decodeHtmlEntities(str);
  }
  str = str.replace(/<head[^>]*>[\s\S]*?<\/head>/gi, '');
  str = str.replace(/<style[^>]*>[\s\S]*?<\/style>/gi, '');
  str = str.replace(/<script[^>]*>[\s\S]*?<\/script>/gi, '');
  // Replace block element endings and line breaks with space
  str = str.replace(/<\/(p|div|li|h[1-6])>/gi, ' ');
  str = str.replace(/<br\s*\/?>/gi, ' ');
  // Strip remaining tags
  str = str.replace(/<[^>]+>/g, '');
  // Clean up any stray spaces before punctuation
  str = str.replace(/\s+([.,;:!?])/g, '$1');
  return str.replace(/\s+/g, ' ').trim();
}

// ---------------------------------------------------------------------------
// JSON / Raw Mapping
// ---------------------------------------------------------------------------

interface RawFeedItem {
  product_id?: string | number;
  productId?: string | number;
  name?: string;
  title?: string;
  description?: string;
  price?: string | number;
  price_red?: string | number;
  price_bb?: string | number;
  price_black?: string | number;
  special?: string | number;
  sku?: string | number;
  vendorCode?: string | number;
  vendor_code?: string | number;
  code?: string | number;
  thumb?: string;
  picture?: string;
  image?: string;
  weight?: string | number;
  net_volume?: string | number;
  netVolume?: string | number;
  unit?: string;
  quantity?: string | number;
  url?: string;
  '@_id'?: string | number;
  id?: string | number;
}

function toNum(v: string | number | undefined): number {
  if (v === undefined || v === null || v === '') return 0;
  return parseFloat(String(v)) || 0;
}

function toStr(v: unknown): string {
  if (v === undefined || v === null) return '';
  if (typeof v === 'object' && v !== null && '#text' in v) {
    return String((v as { '#text': unknown })['#text']).trim();
  }
  return String(v).trim();
}

function mapRaw(r: RawFeedItem): FeedProduct | null {
  const sku = toStr(
    r.sku || r.vendorCode || r.vendor_code || r.code || r.productId || r.product_id || r.id || r['@_id'],
  );
  const name = toStr(r.name || r.title);
  if (!sku || !name) return null;

  const priceRed = toNum(r.special ?? r.price_red);
  const priceRrp = toNum(r.price);
  const displayPrice = priceRed > 0 ? priceRed : priceRrp;
  const rrp = priceRrp > 0 && priceRrp > displayPrice ? priceRrp : undefined;

  const thumbUrl = toStr(r.picture || r.thumb || r.image);

  return {
    sku,
    name,
    description: cleanFeedDescription(toStr(r.description)),
    price: displayPrice,
    rrp,
    thumbUrl,
    weight: toStr(r.weight) || undefined,
    netVolume: toStr(r.netVolume || r.net_volume) || undefined,
    unit: toStr(r.unit) || undefined,
    quantity: toStr(r.quantity) || undefined,
  };
}

// ---------------------------------------------------------------------------
// JSON parser
// ---------------------------------------------------------------------------

export function parseLivestaJson(raw: unknown): FeedProduct[] {
  if (!raw || typeof raw !== 'object') return [];

  let arr: unknown[] = [];
  if (Array.isArray(raw)) {
    arr = raw;
  } else {
    const obj = raw as Record<string, unknown>;
    // Check shop.products (Livesta API shape)
    if (obj['shop'] && typeof obj['shop'] === 'object') {
      const shop = obj['shop'] as Record<string, unknown>;
      if (Array.isArray(shop['products'])) arr = shop['products'] as unknown[];
      else if (Array.isArray(shop['offers'])) arr = shop['offers'] as unknown[];
    }

    if (!arr.length) {
      if (Array.isArray(obj['products'])) arr = obj['products'] as unknown[];
      else if (Array.isArray(obj['data'])) arr = obj['data'] as unknown[];
      else if (Array.isArray(obj['offers'])) arr = obj['offers'] as unknown[];
      else if (Array.isArray(obj['items'])) arr = obj['items'] as unknown[];
      else {
        // Search top-level values
        for (const key of Object.keys(obj)) {
          if (Array.isArray(obj[key])) {
            arr = obj[key] as unknown[];
            break;
          }
        }
      }
    }
  }

  return arr.map(item => mapRaw(item as RawFeedItem)).filter((x): x is FeedProduct => x !== null);
}

// ---------------------------------------------------------------------------
// XML parser
// ---------------------------------------------------------------------------

export function parseLivestaXml(xmlStr: string): FeedProduct[] {
  const parser = new XMLParser({
    ignoreAttributes: false,
    attributeNamePrefix: '@_',
    textNodeName: '#text',
    parseTagValue: true,
    parseAttributeValue: false,
    trimValues: true,
    removeNSPrefix: true,
    isArray: tagName => tagName === 'product' || tagName === 'item' || tagName === 'offer',
  });

  let parsed: Record<string, unknown>;
  try {
    parsed = parser.parse(xmlStr) as Record<string, unknown>;
  } catch {
    return [];
  }

  // Find products/items array anywhere in parsed structure
  function findItemsArray(obj: unknown, depth = 0): unknown[] | null {
    if (depth > 6 || !obj || typeof obj !== 'object') return null;
    if (Array.isArray(obj)) return obj;
    const rec = obj as Record<string, unknown>;

    for (const key of ['item', 'product', 'offer']) {
      if (Array.isArray(rec[key])) return rec[key] as unknown[];
    }

    for (const val of Object.values(rec)) {
      const found = findItemsArray(val, depth + 1);
      if (found) return found;
    }
    return null;
  }

  const items = findItemsArray(parsed) ?? [];
  return items.map(item => mapRaw(item as RawFeedItem)).filter((x): x is FeedProduct => x !== null);
}

// ---------------------------------------------------------------------------
// Characteristics builder
// ---------------------------------------------------------------------------

export function buildCharacteristics(fp: FeedProduct): string {
  const lines: string[] = [];
  if (fp.netVolume) {
    lines.push(fp.unit ? `Об'єм: ${fp.netVolume} ${fp.unit}` : `Об'єм: ${fp.netVolume}`);
  }
  if (fp.weight && fp.weight !== '0' && fp.weight !== '0.000') {
    lines.push(`Вага: ${fp.weight} кг`);
  }
  if (fp.quantity) {
    lines.push(`Залишок: ${fp.quantity}`);
  }
  return lines.join('\n');
}

// ---------------------------------------------------------------------------
// Format detection
// ---------------------------------------------------------------------------

export type FeedFormat = 'json' | 'xml';

export function detectFeedFormat(url: string, rawText?: string): FeedFormat {
  if (rawText) {
    const trimmed = rawText.trim();
    if (trimmed.startsWith('<')) return 'xml';
    if (trimmed.startsWith('{') || trimmed.startsWith('[')) return 'json';
  }
  try {
    const params = new URL(url).searchParams;
    if (params.get('format') === 'xml') return 'xml';
  } catch {
    // ignore malformed URL
  }
  if (url.includes('format=xml') || url.toLowerCase().endsWith('.xml')) return 'xml';
  return 'json';
}
