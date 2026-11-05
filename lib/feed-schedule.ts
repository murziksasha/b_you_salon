import path from 'path';
import { atomicWriteJson } from './atomic-write';
import { withFileMutex } from './file-mutex';
import { promises as fs } from 'fs';

export type FeedSchedule = {
  enabled: boolean;
  url: string;
  lastSuccessDate: string | null; // YYYY-MM-DD Europe/Kyiv
  lastSuccessAt: string | null;
  lastError: string | null;
  lastErrorAt: string | null;
  failureNotifiedDate: string | null;
  skipDate: string | null;
  nextAttemptAt: string | null;
};

const DEFAULT_URL = 'https://livesta.ua/index.php?route=api/products';

export const DEFAULT_FEED_SCHEDULE: FeedSchedule = {
  enabled: false,
  url: DEFAULT_URL,
  lastSuccessDate: null,
  lastSuccessAt: null,
  lastError: null,
  lastErrorAt: null,
  failureNotifiedDate: null,
  skipDate: null,
  nextAttemptAt: null,
};

function scheduleFilePath(): string {
  const dataDir = process.env.DATA_DIR || path.join(process.cwd(), 'data');
  return path.join(dataDir, 'feed-schedule.json');
}

export async function readFeedSchedule(): Promise<FeedSchedule> {
  try {
    const raw = await fs.readFile(scheduleFilePath(), 'utf-8');
    return { ...DEFAULT_FEED_SCHEDULE, ...(JSON.parse(raw) as Partial<FeedSchedule>) };
  } catch {
    return { ...DEFAULT_FEED_SCHEDULE };
  }
}

export async function saveFeedSchedule(sched: FeedSchedule): Promise<void> {
  return withFileMutex(scheduleFilePath(), () => atomicWriteJson(scheduleFilePath(), sched));
}

/** Europe/Kyiv date string YYYY-MM-DD for a given Date. */
export function kyivDate(now: Date): string {
  return now.toLocaleDateString('sv-SE', { timeZone: 'Europe/Kyiv' });
}

/** True if the Kyiv wall clock hour is >= 04:00. */
export function kyivIsAfter0400(now: Date): boolean {
  const kyivStr = now.toLocaleTimeString('en-GB', { timeZone: 'Europe/Kyiv', hour: '2-digit', minute: '2-digit', hour12: false });
  const [hh, mm] = kyivStr.split(':').map(Number);
  return (hh ?? 0) > 4 || ((hh ?? 0) === 4 && (mm ?? 0) >= 0);
}

/**
 * Returns true when a scheduled import run is due.
 * All of the following must hold:
 * - schedule is enabled
 * - Kyiv clock >= 04:00
 * - lastSuccessDate is not today (Kyiv)
 * - skipDate is not today (Kyiv)
 * - nextAttemptAt is null or in the past
 */
export function isScheduleDue(sched: FeedSchedule, now: Date): boolean {
  if (!sched.enabled) return false;
  if (!kyivIsAfter0400(now)) return false;
  const today = kyivDate(now);
  if (sched.lastSuccessDate === today) return false;
  if (sched.skipDate === today) return false;
  if (sched.nextAttemptAt && new Date(sched.nextAttemptAt) > now) return false;
  return true;
}

/**
 * Apply the Continue rule (enabling the schedule).
 * - Before 04:00: clear skipDate so today's 04:00 can run.
 * - At/after 04:00: set skipDate=today so the next run is tomorrow.
 */
export function applyContinue(sched: FeedSchedule, now: Date): FeedSchedule {
  const today = kyivDate(now);
  if (kyivIsAfter0400(now)) {
    return { ...sched, enabled: true, skipDate: today, nextAttemptAt: null };
  }
  return { ...sched, enabled: true, skipDate: null, nextAttemptAt: null };
}

/**
 * Apply the Stop rule (disabling the schedule).
 * Does NOT clear lastSuccessDate.
 */
export function applyStop(sched: FeedSchedule): FeedSchedule {
  return { ...sched, enabled: false };
}

/**
 * Compute a human-readable "next run" label for the UI.
 */
export function nextRunLabel(sched: FeedSchedule, now: Date): string {
  if (!sched.enabled) return 'Зупинено';
  const today = kyivDate(now);
  const after0400 = kyivIsAfter0400(now);
  const skipped = sched.skipDate === today;
  const succeeded = sched.lastSuccessDate === today;
  if (after0400 && (skipped || succeeded)) {
    return 'Завтра 04:00 (Kyiv)';
  }
  if (sched.nextAttemptAt) {
    const at = new Date(sched.nextAttemptAt);
    if (at > now) {
      return `Повтор о ${at.toLocaleTimeString('uk-UA', { timeZone: 'Europe/Kyiv', hour: '2-digit', minute: '2-digit' })}`;
    }
  }
  return 'Сьогодні 04:00 (Kyiv)';
}

/**
 * When a manual import succeeds:
 * If schedule is enabled, Kyiv time is at or after 04:00, and skipDate is not today:
 * stamp lastSuccessDate, lastSuccessAt, and clear lastError, lastErrorAt, nextAttemptAt.
 * Retries stop.
 */
export async function stampManualSuccessIfNeeded(now: Date): Promise<boolean> {
  try {
    const sched = await readFeedSchedule();
    if (!sched.enabled) return false;
    if (!kyivIsAfter0400(now)) return false;
    const today = kyivDate(now);
    if (sched.skipDate === today) return false;
    if (sched.lastSuccessDate === today) return false;
    await saveFeedSchedule({
      ...sched,
      lastSuccessDate: today,
      lastSuccessAt: now.toISOString(),
      lastError: null,
      lastErrorAt: null,
      nextAttemptAt: null,
    });
    return true;
  } catch {
    return false;
  }
}

