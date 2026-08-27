/**
 * CLI snapshot of data/site.json → data/backups/
 *
 * Usage:
 *   npm run backup
 *   DATA_DIR=/app/data npm run backup
 *
 * Windows Task Scheduler / cron example: see docs/deploy.md
 */
import { promises as fs } from 'fs';
import path from 'path';
import { createSiteBackupFromData } from '../lib/backup';
import type { SiteData } from '../lib/types';

async function main() {
  const dataDir = process.env.DATA_DIR || path.join(process.cwd(), 'data');
  const sitePath = path.join(dataDir, 'site.json');
  const raw = await fs.readFile(sitePath, 'utf-8');
  const data = JSON.parse(raw) as SiteData;
  const info = await createSiteBackupFromData(data, { label: 'cli' });
  console.log(`Backup written: ${info.name} (${info.size} bytes)`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
