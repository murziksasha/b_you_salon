import { applyScheduledPublishes } from './scheduled-publish';
import { getSiteData, saveSiteData, withSiteDataLock } from './site-data';

const DEFAULT_INTERVAL_MS = 30_000;

type GlobalJobs = {
  __byouSchedPublish?: { timer: ReturnType<typeof setInterval>; running: boolean };
};

function jobs(): GlobalJobs {
  return globalThis as GlobalJobs;
}

/**
 * Apply due scheduled publishes as a dedicated write, not as a side-effect of reads.
 */
export async function runDueScheduledPublishes(): Promise<string[]> {
  return withSiteDataLock(async () => {
    const data = await getSiteData();
    const { site, published } = applyScheduledPublishes(data);
    if (!published.length) return [];
    await saveSiteData(site);
    try {
      const { appendActivity } = await import('./admin-activity');
      await appendActivity({
        kind: 'site_save',
        message: `Scheduled publish: ${published.length} page(s)`,
      });
    } catch {
      /* ignore activity errors */
    }
    return published;
  });
}

export function startScheduledPublishLoop(intervalMs = DEFAULT_INTERVAL_MS): void {
  const g = jobs();
  if (g.__byouSchedPublish?.timer) return;
  g.__byouSchedPublish = { timer: setInterval(() => void tick(), intervalMs), running: false };
  g.__byouSchedPublish.timer.unref?.();
  void tick();
}

export function stopScheduledPublishLoop(): void {
  const g = jobs();
  if (g.__byouSchedPublish?.timer) {
    clearInterval(g.__byouSchedPublish.timer);
  }
  g.__byouSchedPublish = undefined;
}

async function tick(): Promise<void> {
  const g = jobs();
  const state = g.__byouSchedPublish;
  if (!state || state.running) return;
  state.running = true;
  try {
    await runDueScheduledPublishes();
  } catch (err) {
    console.error('[scheduled-publish] tick failed', err);
  } finally {
    if (g.__byouSchedPublish) g.__byouSchedPublish.running = false;
  }
}
