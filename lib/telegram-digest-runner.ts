import { runCatchupIfNeeded, tickTelegramDigest } from './telegram-digest';

const DEFAULT_INTERVAL_MS = 30_000;

type GlobalJobs = {
  __byouTelegramDigest?: { timer: ReturnType<typeof setInterval>; running: boolean };
};

function jobs(): GlobalJobs {
  return globalThis as GlobalJobs;
}

export function startTelegramDigestLoop(intervalMs = DEFAULT_INTERVAL_MS): void {
  const g = jobs();
  if (g.__byouTelegramDigest?.timer) return;
  g.__byouTelegramDigest = { timer: setInterval(() => void tick(), intervalMs), running: false };
  g.__byouTelegramDigest.timer.unref?.();
  void tick();
}

export function stopTelegramDigestLoop(): void {
  const g = jobs();
  if (g.__byouTelegramDigest?.timer) {
    clearInterval(g.__byouTelegramDigest.timer);
  }
  g.__byouTelegramDigest = undefined;
}

async function tick(): Promise<void> {
  const g = jobs();
  const state = g.__byouTelegramDigest;
  if (!state || state.running) return;
  state.running = true;
  try {
    await runCatchupIfNeeded();
    await tickTelegramDigest();
  } catch (err) {
    console.error('[telegram-digest] tick failed', err);
  } finally {
    if (g.__byouTelegramDigest) g.__byouTelegramDigest.running = false;
  }
}
