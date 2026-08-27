import { promises as fs } from 'fs';
import path from 'path';
import { atomicWriteJson } from './atomic-write';
import type { Page } from './types';

const MAX_REVISIONS_PER_PAGE = 30;

function dataRoot(): string {
  return process.env.DATA_DIR || path.join(process.cwd(), 'data');
}

function pageRevDir(pageId: string): string {
  const safe = pageId.replace(/[^a-zA-Z0-9_-]/g, '_').slice(0, 80) || 'page';
  return path.join(dataRoot(), 'revisions', safe);
}

export type PageRevisionMeta = {
  id: string;
  pageId: string;
  at: string;
  title: string;
  slug: string;
  actor?: string;
  label?: string;
};

export type PageRevision = PageRevisionMeta & {
  page: Page;
};

export async function listPageRevisions(pageId: string): Promise<PageRevisionMeta[]> {
  const dir = pageRevDir(pageId);
  let names: string[] = [];
  try {
    names = await fs.readdir(dir);
  } catch {
    return [];
  }
  const metas: PageRevisionMeta[] = [];
  for (const name of names) {
    if (!name.endsWith('.json')) continue;
    try {
      const raw = await fs.readFile(path.join(dir, name), 'utf-8');
      const rev = JSON.parse(raw) as PageRevision;
      metas.push({
        id: rev.id,
        pageId: rev.pageId,
        at: rev.at,
        title: rev.title,
        slug: rev.slug,
        actor: rev.actor,
        label: rev.label,
      });
    } catch {
      /* skip corrupt */
    }
  }
  metas.sort((a, b) => Date.parse(b.at) - Date.parse(a.at));
  return metas;
}

export async function getPageRevision(pageId: string, revId: string): Promise<PageRevision | null> {
  const safeRev = revId.replace(/[^a-zA-Z0-9_.-]/g, '');
  if (!safeRev) return null;
  const file = path.join(pageRevDir(pageId), `${safeRev}.json`);
  try {
    const raw = await fs.readFile(file, 'utf-8');
    return JSON.parse(raw) as PageRevision;
  } catch {
    return null;
  }
}

export async function savePageRevision(
  page: Page,
  opts?: { actor?: string; label?: string },
): Promise<PageRevisionMeta> {
  const dir = pageRevDir(page.id);
  await fs.mkdir(dir, { recursive: true });
  const at = new Date().toISOString();
  const id = at.replace(/[:.]/g, '-');
  const rev: PageRevision = {
    id,
    pageId: page.id,
    at,
    title: page.title,
    slug: page.slug,
    actor: opts?.actor,
    label: opts?.label,
    page: structuredClone(page),
  };
  await atomicWriteJson(path.join(dir, `${id}.json`), rev);

  // Cap revisions
  const list = await listPageRevisions(page.id);
  if (list.length > MAX_REVISIONS_PER_PAGE) {
    for (const old of list.slice(MAX_REVISIONS_PER_PAGE)) {
      try {
        await fs.unlink(path.join(dir, `${old.id}.json`));
      } catch {
        /* ignore */
      }
    }
  }

  return {
    id: rev.id,
    pageId: rev.pageId,
    at: rev.at,
    title: rev.title,
    slug: rev.slug,
    actor: rev.actor,
    label: rev.label,
  };
}
