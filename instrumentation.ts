export async function register(): Promise<void> {
  if (process.env.NEXT_RUNTIME === 'nodejs') {
    if (process.env.NEXT_PHASE === 'phase-production-build') return;
    if (process.env.VITEST) return;

    const { startScheduledPublishLoop } = await import('./lib/scheduled-publish-runner');
    startScheduledPublishLoop();
  }
}
