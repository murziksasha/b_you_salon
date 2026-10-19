import {
  readFeedSchedule,
  saveFeedSchedule,
  isScheduleDue,
  kyivDate,
} from './feed-schedule';
import { runFeedImport, isFeedImportRunning, FeedImportConflictError } from './run-feed-import';

const TICK_INTERVAL_MS = 30_000;

type GlobalRunner = {
  __byouFeedSchedRunner?: { timer: ReturnType<typeof setInterval>; running: boolean; abort: AbortController | null };
};

function runner(): GlobalRunner {
  return globalThis as GlobalRunner;
}

export function startFeedScheduleLoop(intervalMs = TICK_INTERVAL_MS): void {
  const g = runner();
  if (g.__byouFeedSchedRunner?.timer) return;
  g.__byouFeedSchedRunner = {
    timer: setInterval(() => void tick(), intervalMs),
    running: false,
    abort: null,
  };
  g.__byouFeedSchedRunner.timer.unref?.();
  void tick();
}

export function stopFeedScheduleLoop(): void {
  const g = runner();
  if (g.__byouFeedSchedRunner?.timer) {
    clearInterval(g.__byouFeedSchedRunner.timer);
  }
  g.__byouFeedSchedRunner?.abort?.abort();
  g.__byouFeedSchedRunner = undefined;
}

/** Abort an in-progress scheduled run. Called by Stop. */
export function abortScheduledRun(): void {
  runner().__byouFeedSchedRunner?.abort?.abort();
}

async function tick(): Promise<void> {
  const g = runner();
  const state = g.__byouFeedSchedRunner;
  if (!state || state.running) return;

  const now = new Date();
  const sched = await readFeedSchedule().catch(() => null);
  if (!sched) return;
  if (!isScheduleDue(sched, now)) return;
  if (isFeedImportRunning()) return; // manual import in progress — skip silently

  state.running = true;
  const controller = new AbortController();
  state.abort = controller;
  try {
    const result = await runFeedImport({
      url: sched.url,
      downloadImages: false,
      signal: controller.signal,
    });

    if (result.aborted) {
      // Stop was pressed — do not stamp success
      return;
    }

    // Success
    const today = kyivDate(new Date());
    await saveFeedSchedule({
      ...sched,
      lastSuccessDate: today,
      lastSuccessAt: new Date().toISOString(),
      lastError: null,
      lastErrorAt: null,
      nextAttemptAt: null,
    });

    try {
      const { appendActivity } = await import('./admin-activity');
      await appendActivity({
        kind: 'site_save',
        message: `Плановий імпорт фіду: +${result.created} нових, ${result.updated} оновлено (${result.format.toUpperCase()})`,
        actor: 'schedule',
      });
    } catch {
      /* non-fatal */
    }
  } catch (err) {
    if (err instanceof FeedImportConflictError) {
      // Shared import lock was held — skip tick silently without recording failure
      return;
    }
    // Failure — schedule retry
    const errMsg = err instanceof Error ? err.message : String(err);
    const nextAttemptAt = new Date(Date.now() + 15 * 60_000).toISOString();
    const today = kyivDate(new Date());
    const shouldNotify = sched.failureNotifiedDate !== today;

    await saveFeedSchedule({
      ...sched,
      lastError: errMsg,
      lastErrorAt: new Date().toISOString(),
      nextAttemptAt,
      failureNotifiedDate: shouldNotify ? today : sched.failureNotifiedDate,
    }).catch(() => undefined);

    if (shouldNotify) {
      try {
        const { appendActivity } = await import('./admin-activity');
        await appendActivity({
          kind: 'other',
          message: `Плановий імпорт фіду: помилка — ${errMsg.slice(0, 200)}`,
          actor: 'schedule',
        });
      } catch {
        /* non-fatal */
      }
    }
  } finally {
    if (state) {
      state.running = false;
      state.abort = null;
    }
  }
}
