import type { Page, Section } from './types';

export type SeoHint = {
  level: 'warn' | 'info';
  message: string;
};

export function pageSeoHints(page: Page): SeoHint[] {
  const hints: SeoHint[] = [];
  if (!page.title?.trim()) {
    hints.push({ level: 'warn', message: 'Порожня назва сторінки' });
  }
  if (!page.description?.trim()) {
    hints.push({ level: 'warn', message: 'Немає meta description' });
  } else if (page.description.length > 160) {
    hints.push({ level: 'info', message: 'Description довша за ~160 символів' });
  }
  if (page.contentHtml?.trim()) {
    hints.push({ level: 'info', message: 'HTML-режим: секції на сайті ігноруються' });
    return hints;
  }
  const visible = (page.sections || []).filter((s) => s.visible);
  if (!visible.length) {
    hints.push({ level: 'warn', message: 'Немає видимих секцій' });
  }
  const hasHero = visible.some((s) => s.type === 'hero');
  if (!hasHero && visible.length) {
    hints.push({ level: 'info', message: 'Немає hero-секції (H1 часто з hero)' });
  }
  for (const s of visible) {
    hints.push(...sectionAltHints(s));
  }
  return hints;
}

function sectionAltHints(section: Section): SeoHint[] {
  const out: SeoHint[] = [];
  const s = section as Section & Record<string, unknown>;
  if (typeof s.image === 'string' && s.image && typeof s.imageAlt === 'string' && !s.imageAlt.trim()) {
    out.push({ level: 'warn', message: `Секція ${section.type}: порожній alt зображення` });
  }
  return out;
}
