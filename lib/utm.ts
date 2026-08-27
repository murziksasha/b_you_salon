export interface UtmParams {
  utmSource?: string;
  utmMedium?: string;
  utmCampaign?: string;
  utmContent?: string;
  utmTerm?: string;
}

const MAX = 120;

function clean(v: unknown): string | undefined {
  if (typeof v !== 'string') return undefined;
  const t = v.trim().slice(0, MAX);
  return t || undefined;
}

/** Parse UTM from a relative pagePath (path?query) or explicit fields. */
export function parseUtmFromPagePath(pagePath?: string): UtmParams {
  if (!pagePath || !pagePath.includes('?')) return {};
  try {
    const q = pagePath.split('?')[1] || '';
    const params = new URLSearchParams(q);
    return {
      utmSource: clean(params.get('utm_source')),
      utmMedium: clean(params.get('utm_medium')),
      utmCampaign: clean(params.get('utm_campaign')),
      utmContent: clean(params.get('utm_content')),
      utmTerm: clean(params.get('utm_term')),
    };
  } catch {
    return {};
  }
}

export function parseUtmFromBody(body: Record<string, unknown>): UtmParams {
  return {
    utmSource: clean(body.utmSource ?? body.utm_source),
    utmMedium: clean(body.utmMedium ?? body.utm_medium),
    utmCampaign: clean(body.utmCampaign ?? body.utm_campaign),
    utmContent: clean(body.utmContent ?? body.utm_content),
    utmTerm: clean(body.utmTerm ?? body.utm_term),
  };
}

export function mergeUtm(a: UtmParams, b: UtmParams): UtmParams {
  return {
    utmSource: a.utmSource || b.utmSource,
    utmMedium: a.utmMedium || b.utmMedium,
    utmCampaign: a.utmCampaign || b.utmCampaign,
    utmContent: a.utmContent || b.utmContent,
    utmTerm: a.utmTerm || b.utmTerm,
  };
}

export function formatUtmLine(u: UtmParams): string {
  const parts: string[] = [];
  if (u.utmSource) parts.push(`source=${u.utmSource}`);
  if (u.utmMedium) parts.push(`medium=${u.utmMedium}`);
  if (u.utmCampaign) parts.push(`campaign=${u.utmCampaign}`);
  if (u.utmContent) parts.push(`content=${u.utmContent}`);
  if (u.utmTerm) parts.push(`term=${u.utmTerm}`);
  return parts.join(' · ') || '—';
}
