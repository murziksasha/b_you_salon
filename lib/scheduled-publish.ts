import type { Page, SiteData } from './types';

/**
 * Apply due scheduled publishes: if page.publishAt <= now and page has draft,
 * promote draft to live (or just clear publishAt if no draft and visible intended).
 *
 * Convention on Page:
 * - publishAt?: ISO string — when to publish draft to live
 * - draft?: body snapshot
 */
export function applyScheduledPublishes(
  site: SiteData,
  now = Date.now(),
): { site: SiteData; published: string[] } {
  const published: string[] = [];
  const pages = site.pages.map((page) => {
    const at = page.publishAt ? Date.parse(page.publishAt) : NaN;
    if (!Number.isFinite(at) || at > now) return page;
    if (!page.draft) {
      // schedule only for visibility flip?
      if (page.publishAt) {
        published.push(page.id);
        const { publishAt: _p, ...rest } = page;
        return { ...rest, visible: true } as Page;
      }
      return page;
    }
    const d = page.draft;
    published.push(page.id);
    return {
      ...page,
      title: d.title ?? page.title,
      description: d.description ?? page.description,
      sections: d.sections ? structuredClone(d.sections) : page.sections,
      contentHtml: d.contentHtml !== undefined ? d.contentHtml : page.contentHtml,
      titleSize: d.titleSize !== undefined ? d.titleSize : page.titleSize,
      textScale: d.textScale !== undefined ? d.textScale : page.textScale,
      draft: undefined,
      publishAt: undefined,
      visible: true,
    } as Page;
  });
  if (!published.length) return { site, published };
  return { site: { ...site, pages }, published };
}
