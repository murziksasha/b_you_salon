import { promises as fs } from 'fs';
import path from 'path';
import { defaultSiteData } from '../lib/default-site-data';
import { getDataFilePathForScripts } from '../lib/site-data';

async function main(): Promise<void> {
  const targetPath = getDataFilePathForScripts();
  const seedPath = path.join(process.cwd(), 'data', 'site.json');

  await fs.mkdir(path.dirname(targetPath), { recursive: true });
  await fs.mkdir(path.dirname(seedPath), { recursive: true });

  let json: string;
  const seedTemplatePath = path.join(process.cwd(), 'data', 'site.seed.json');
  try {
    json = await fs.readFile(seedTemplatePath, 'utf-8');
    console.log(`Using seed template from ${seedTemplatePath}`);
  } catch {
    json = JSON.stringify(defaultSiteData, null, 2);
    console.log('Using minimal defaultSiteData');
  }

  await fs.writeFile(targetPath, json, 'utf-8');
  console.log(`Seeded site data to ${targetPath}`);
}

main().catch((error: unknown) => {
  console.error('Seed failed:', error);
  process.exit(1);
});
