import path from 'path';
import { validateJournalsDir } from '../lib/journal-preflight';

async function main() {
  const targetDir = process.argv[2]
    ? path.resolve(process.argv[2])
    : process.env.DATA_DIR
      ? path.resolve(process.env.DATA_DIR)
      : path.join(process.cwd(), 'data');

  console.log(`[preflight] Checking journals in: ${targetDir}`);
  const report = await validateJournalsDir(targetDir, { requireAll: false });

  console.log(`[preflight] site.json: ${report.site.valid ? 'OK' : 'FAIL'} (${report.site.recordCount} items)`);
  if (!report.site.valid) {
    for (const issue of report.site.issues) {
      console.error(`  - [site] ${issue.path}: ${issue.message}`);
    }
  }

  console.log(`[preflight] leads.json: ${report.leads.valid ? 'OK' : 'FAIL'} (${report.leads.recordCount} records)`);
  if (!report.leads.valid) {
    for (const issue of report.leads.issues) {
      const rec = issue.recordId ? `[id: ${issue.recordId}] ` : issue.recordIndex !== undefined ? `[idx: ${issue.recordIndex}] ` : '';
      console.error(`  - [leads] ${rec}${issue.path}: ${issue.message}`);
    }
  }

  console.log(`[preflight] orders.json: ${report.orders.valid ? 'OK' : 'FAIL'} (${report.orders.recordCount} records)`);
  if (!report.orders.valid) {
    for (const issue of report.orders.issues) {
      const rec = issue.recordId ? `[id: ${issue.recordId}] ` : issue.recordIndex !== undefined ? `[idx: ${issue.recordIndex}] ` : '';
      console.error(`  - [orders] ${rec}${issue.path}: ${issue.message}`);
    }
  }

  console.log(`[preflight] Summary: ${report.ok ? 'PASSED' : 'FAILED'} (Total errors: ${report.totalErrors})`);

  if (!report.ok) {
    process.exit(1);
  }
}

main().catch((err) => {
  console.error('[preflight] Fatal execution error:', err);
  process.exit(1);
});

