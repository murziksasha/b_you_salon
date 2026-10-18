import fs from 'node:fs';
import path from 'node:path';
import { cleanFeedDescription } from '../lib/feed-import';
import { atomicWriteFile } from '../lib/atomic-write';

async function main() {
  const filePath = path.join(process.cwd(), 'data', 'site.json');
  const raw = fs.readFileSync(filePath, 'utf8');
  const siteData = JSON.parse(raw);

  let cleanedCount = 0;
  for (const good of siteData.goods) {
    if (!good.description) continue;
    const prev = good.description;
    const next = cleanFeedDescription(prev);
    if (prev !== next) {
      good.description = next;
      cleanedCount++;
    }
  }

  siteData.updatedAt = new Date().toISOString();
  await atomicWriteFile(filePath, JSON.stringify(siteData, null, 2), { encoding: 'utf8' });
  console.log(`Successfully cleaned descriptions for ${cleanedCount} products.`);
}

main().catch(err => {
  console.error(err);
  process.exit(1);
});
