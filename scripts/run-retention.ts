import { runDailyRetention } from '../lib/retention-runner';

async function main() {
  const isDryRun = process.argv.includes('--dry-run');
  const isForce = process.argv.includes('--force');

  console.log(`[retention] Starting daily retention run (dryRun: ${isDryRun}, force: ${isForce})...`);
  const result = await runDailyRetention({ dryRun: isDryRun, force: isForce });

  if (!result.executed) {
    console.log(`[retention] Skipped: ${result.skippedReason}${result.error ? ` (${result.error})` : ''}`);
    return;
  }

  console.log('[retention] Completed:');
  console.log(`  - Leads purged: ${result.leadsPurged}`);
  console.log(`  - Leads retained: ${result.leadsRetained}`);
  console.log(`  - Orders purged: ${result.ordersPurged} (statutory hold active)`);
  console.log(`  - Orders retained: ${result.ordersRetained}`);
  if (result.backupPath) {
    console.log(`  - Verified pre-purge backup: ${result.backupPath}`);
  }
}

main().catch((err) => {
  console.error('[retention] Fatal error:', err);
  process.exit(1);
});

