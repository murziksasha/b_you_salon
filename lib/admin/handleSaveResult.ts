import type { SaveResult } from './saveSite';
import { saveSiteData } from './saveSite';
import type { SiteData } from '@/lib/types';

export type ConflictChoice = 'force' | 'reload' | 'cancel';

/**
 * Shared conflict UX after saveSiteData / patchSiteSection failure.
 * Returns force-save result if user chose overwrite, otherwise null.
 */
export async function resolveSaveConflict(
  data: SiteData,
  result: SaveResult,
  confirmFn: (msg: string) => boolean = (m) => window.confirm(m),
): Promise<SaveResult | null> {
  if (result.ok || !result.conflict) return null;
  const force = confirmFn(
    `${result.error}\n\nOK — перезаписати сервер своїми даними.\nСкасувати — оновити сторінку.`,
  );
  if (!force) {
    window.location.reload();
    return null;
  }
  return saveSiteData(data, { force: true });
}
