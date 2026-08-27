import type { SiteData } from '@/lib/types';
import { parseRetryAfterSeconds, rateLimitMessage } from './rateLimitUi';

export type SaveResult =
  | { ok: true; updatedAt?: string }
  | { ok: false; error: string; conflict?: boolean; serverUpdatedAt?: string };

export async function saveSiteData(
  data: SiteData,
  opts?: { force?: boolean },
): Promise<SaveResult> {
  try {
    const payload = opts?.force
      ? { ...data, updatedAt: undefined } // omit client rev → server accepts (no conflict check when missing)
      : data;
    // Force: stamp with a magic field via header instead — API checks forceOverwrite
    const res = await fetch('/api/site', {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json',
        ...(opts?.force ? { 'x-force-overwrite': '1' } : {}),
      },
      body: JSON.stringify(payload),
    });

    if (!res.ok) {
      if (res.status === 429) {
        const seconds = parseRetryAfterSeconds(res, 60);
        return { ok: false, error: rateLimitMessage(seconds, 'save') };
      }
      if (res.status === 409) {
        const json = (await res.json().catch(() => ({}))) as {
          error?: string;
          updatedAt?: string;
        };
        return {
          ok: false,
          conflict: true,
          serverUpdatedAt: json.updatedAt,
          error: json.error || 'Дані змінені іншим сеансом. Оновіть сторінку.',
        };
      }
      const json = (await res.json().catch(() => ({}))) as { error?: string };
      return { ok: false, error: json.error || `Помилка збереження (${res.status})` };
    }

    const json = (await res.json().catch(() => ({}))) as { updatedAt?: string };
    return { ok: true, updatedAt: json.updatedAt };
  } catch {
    return { ok: false, error: 'Мережева помилка' };
  }
}

export async function fetchSiteData(): Promise<SiteData | null> {
  try {
    const res = await fetch('/api/site');
    if (!res.ok) return null;
    return (await res.json()) as SiteData;
  } catch {
    return null;
  }
}

/** Partial save of one top-level section (reduces overwrite races). */
export async function patchSiteSection(
  section:
    | 'goods'
    | 'services'
    | 'settings'
    | 'headerMenu'
    | 'headerMenuSalon'
    | 'headerMenuShop'
    | 'servicesNav'
    | 'pages'
    | 'shopLink',
  data: unknown,
  expectedUpdatedAt?: string,
): Promise<SaveResult> {
  try {
    const res = await fetch('/api/site', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ section, data, expectedUpdatedAt }),
    });
    if (!res.ok) {
      if (res.status === 429) {
        const seconds = parseRetryAfterSeconds(res, 60);
        return { ok: false, error: rateLimitMessage(seconds, 'save') };
      }
      if (res.status === 409) {
        const json = (await res.json().catch(() => ({}))) as { error?: string };
        return {
          ok: false,
          conflict: true,
          error: json.error || 'Дані змінені іншим сеансом. Оновіть сторінку.',
        };
      }
      const json = (await res.json().catch(() => ({}))) as { error?: string };
      return { ok: false, error: json.error || `Помилка збереження (${res.status})` };
    }
    const json = (await res.json().catch(() => ({}))) as { updatedAt?: string };
    return { ok: true, updatedAt: json.updatedAt };
  } catch {
    return { ok: false, error: 'Мережева помилка' };
  }
}
