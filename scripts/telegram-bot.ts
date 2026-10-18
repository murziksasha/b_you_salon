import { promises as fs } from 'fs';
import path from 'path';

async function loadDotEnv(): Promise<void> {
  const envPath = path.join(process.cwd(), '.env');
  try {
    const text = await fs.readFile(envPath, 'utf8');
    for (const line of text.split(/\r?\n/)) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith('#')) continue;
      const eq = trimmed.indexOf('=');
      if (eq <= 0) continue;
      const key = trimmed.slice(0, eq).trim();
      let val = trimmed.slice(eq + 1).trim();
      if (
        (val.startsWith('"') && val.endsWith('"')) ||
        (val.startsWith("'") && val.endsWith("'"))
      ) {
        val = val.slice(1, -1);
      }
      if (process.env[key] === undefined) process.env[key] = val;
    }
  } catch {
    // no .env — rely on process env / pm2
  }
}

async function main(): Promise<void> {
  await loadDotEnv();
  const { runTelegramBot } = await import('../lib/telegram-poll');
  const ac = new AbortController();
  const stop = () => ac.abort();
  process.on('SIGINT', stop);
  process.on('SIGTERM', stop);
  await runTelegramBot({ signal: ac.signal });
}

main().catch((err) => {
  console.error('[telegram-bot] fatal', err);
  process.exit(1);
});
