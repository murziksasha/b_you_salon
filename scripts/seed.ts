import { promises as fs } from 'fs';
import path from 'path';
import { defaultSiteData } from '../lib/default-site-data';
import { getDataFilePathForScripts } from '../lib/site-data';

async function main(): Promise<void> {
  const targetPath = getDataFilePathForScripts();
  const seedPath = path.join(process.cwd(), 'data', 'site.json');

  await fs.mkdir(path.dirname(targetPath), { recursive: true });
  await fs.mkdir(path.dirname(seedPath), { recursive: true });

  const json = JSON.stringify(defaultSiteData, null, 2);
  await fs.writeFile(seedPath, json, 'utf-8');
  await fs.writeFile(targetPath, json, 'utf-8');

  console.log(`Seeded site data to ${seedPath} and ${targetPath}`);
}

main().catch((error: unknown) => {
  console.error('Seed failed:', error);
  process.exit(1);
});