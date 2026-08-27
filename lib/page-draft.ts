import type { Page, Section } from './types';

/** Fields that belong to the editable page body (not identity/visibility). */
export type PageBody = {
  title: string;
  description: string;
  sections: Section[];
  contentHtml?: string;
  titleSize?: number;
  textScale?: number;
};

export function pageBodyFrom(page: Page): PageBody {
  return {
    title: page.title,
    description: page.description,
    sections: structuredClone(page.sections || []),
    contentHtml: page.contentHtml,
    titleSize: page.titleSize,
    textScale: page.textScale,
  };
}

export function applyBody(page: Page, body: PageBody): Page {
  return {
    ...page,
    title: body.title,
    description: body.description,
    sections: body.sections,
    contentHtml: body.contentHtml,
    titleSize: body.titleSize,
    textScale: body.textScale,
  };
}

export function hasServerDraft(page: Page): boolean {
  return Boolean(page.draft?.updatedAt || page.draft?.sections || page.draft?.title);
}

/** Published-only view (strip draft for public/live). */
export function publishedPage(page: Page): Page {
  const { draft: _d, ...rest } = page;
  return rest;
}

/**
 * Save draft: keep published live fields from `live`, store editor body in draft.
 */
export function pageWithDraft(live: Page, editor: Page): Page {
  const body = pageBodyFrom(editor);
  return {
    ...publishedPage(live),
    id: live.id,
    slug: live.slug,
    visible: live.visible,
    draft: {
      ...body,
      updatedAt: new Date().toISOString(),
    },
  };
}

/**
 * Publish: editor body becomes live; clear draft.
 */
export function pagePublished(editor: Page): Page {
  return {
    ...applyBody(editor, pageBodyFrom(editor)),
    id: editor.id,
    slug: editor.slug,
    visible: editor.visible,
    draft: undefined,
  };
}

/** Load draft body into a working page (for editor). */
export function pageFromDraft(page: Page): Page | null {
  if (!hasServerDraft(page) || !page.draft) return null;
  const d = page.draft;
  return {
    ...page,
    title: d.title ?? page.title,
    description: d.description ?? page.description,
    sections: d.sections ? structuredClone(d.sections) : page.sections,
    contentHtml: d.contentHtml !== undefined ? d.contentHtml : page.contentHtml,
    titleSize: d.titleSize !== undefined ? d.titleSize : page.titleSize,
    textScale: d.textScale !== undefined ? d.textScale : page.textScale,
  };
}

export function draftSummary(page: Page): string | null {
  if (!page.draft?.updatedAt) return null;
  try {
    return new Date(page.draft.updatedAt).toLocaleString('uk-UA');
  } catch {
    return page.draft.updatedAt;
  }
}

export type PageDiffLine = {
  field: string;
  kind: 'changed' | 'added' | 'removed' | 'same';
  live?: string;
  next?: string;
};

function short(v: unknown, max = 80): string {
  if (v == null) return '—';
  if (typeof v === 'string') {
    const t = v.replace(/\s+/g, ' ').trim();
    return t.length > max ? `${t.slice(0, max)}…` : t || '—';
  }
  if (typeof v === 'number' || typeof v === 'boolean') return String(v);
  try {
    const s = JSON.stringify(v);
    return s.length > max ? `${s.slice(0, max)}…` : s;
  } catch {
    return '…';
  }
}

function sectionSig(s: Section): string {
  const base = s as Section & Record<string, unknown>;
  return [
    s.id,
    s.type,
    s.visible,
    base.title,
    base.titleHtml,
    base.image,
    Array.isArray(base.items) ? base.items.length : 0,
    Array.isArray(base.images) ? base.images.length : 0,
  ].join('|');
}

/**
 * Human-readable diff between published live body and editor (or draft) body.
 */
export function diffPageBodies(live: PageBody, next: PageBody): PageDiffLine[] {
  const lines: PageDiffLine[] = [];

  const scalar = (field: keyof PageBody, label: string) => {
    const a = live[field];
    const b = next[field];
    const as = short(a);
    const bs = short(b);
    if (as === bs) return;
    lines.push({ field: label, kind: 'changed', live: as, next: bs });
  };

  scalar('title', 'Назва');
  scalar('description', 'Meta description');
  scalar('contentHtml', 'contentHtml');
  scalar('titleSize', 'titleSize');
  scalar('textScale', 'textScale');

  const liveSecs = live.sections || [];
  const nextSecs = next.sections || [];
  if (liveSecs.length !== nextSecs.length) {
    lines.push({
      field: 'Кількість секцій',
      kind: 'changed',
      live: String(liveSecs.length),
      next: String(nextSecs.length),
    });
  }

  const liveById = new Map(liveSecs.map((s) => [s.id, s]));
  const nextById = new Map(nextSecs.map((s) => [s.id, s]));

  for (const s of nextSecs) {
    const prev = liveById.get(s.id);
    if (!prev) {
      lines.push({
        field: `Секція +${s.type}`,
        kind: 'added',
        next: short((s as Section & { title?: string }).title || s.type),
      });
      continue;
    }
    if (sectionSig(prev) !== sectionSig(s)) {
      lines.push({
        field: `Секція ${s.type}`,
        kind: 'changed',
        live: short(sectionSig(prev), 60),
        next: short(sectionSig(s), 60),
      });
    }
  }
  for (const s of liveSecs) {
    if (!nextById.has(s.id)) {
      lines.push({
        field: `Секція −${s.type}`,
        kind: 'removed',
        live: short((s as Section & { title?: string }).title || s.type),
      });
    }
  }

  // Order change (same ids, different order)
  const liveOrder = liveSecs.map((s) => s.id).join(',');
  const nextOrder = nextSecs.map((s) => s.id).join(',');
  if (liveOrder !== nextOrder && liveSecs.length === nextSecs.length) {
    const sameSet =
      liveSecs.length === nextSecs.length &&
      liveSecs.every((s) => nextById.has(s.id));
    if (sameSet) {
      lines.push({
        field: 'Порядок секцій',
        kind: 'changed',
        live: liveSecs.map((s) => s.type).join(' → '),
        next: nextSecs.map((s) => s.type).join(' → '),
      });
    }
  }

  return lines;
}

/** Diff published page vs editor working copy. */
export function diffLiveVsEditor(livePage: Page, editorPage: Page): PageDiffLine[] {
  return diffPageBodies(pageBodyFrom(publishedPage(livePage)), pageBodyFrom(editorPage));
}
