/**
 * Stage 7 migration helper: per-user TOTP.
 *
 * Usage:
 *   npm run migrate:totp            # dry-run (default): report only, writes nothing
 *   npm run migrate:totp -- --apply # back up admins.json + admin-totp.json to data/backups/pre-totp-<ts>/
 *
 * The global secret is intentionally NOT copied into every user (a shared secret is not 2FA).
 * Until a user enables personal 2FA, login falls back to the global secret (transitional mode).
 * This script reports who still relies on that fallback and makes a safety backup. It never
 * modifies or deletes admins.json / admin-totp.json.
 */
import { promises as fs } from 'fs';
import path from 'path';

const apply = process.argv.includes('--apply');
const dataDir = process.env.DATA_DIR || path.join(process.cwd(), 'data');
const adminsPath = path.join(dataDir, 'admins.json');
const globalPath = path.join(dataDir, 'admin-totp.json');

async function readJson<T>(p: string): Promise<T | null> {
  try {
    return JSON.parse(await fs.readFile(p, 'utf-8')) as T;
  } catch {
    return null;
  }
}

async function main() {
  const admins = await readJson<{
    users: Array<{ username: string; role: string; disabled?: boolean; totp?: { secret?: string } }>;
  }>(adminsPath);
  const global = await readJson<{ secret?: string }>(globalPath);
  const envGlobal = Boolean(process.env.ADMIN_TOTP_SECRET?.trim());
  const users = admins?.users ?? [];

  console.log(`[migrate-totp] mode: ${apply ? 'APPLY (backup only)' : 'dry-run'}`);
  console.log(
    `[migrate-totp] global TOTP: ${envGlobal ? 'env ADMIN_TOTP_SECRET' : global?.secret ? 'data/admin-totp.json' : 'none'}`,
  );
  if (!users.length) console.log('[migrate-totp] no admins.json users (single-password mode) — nothing to migrate.');
  for (const u of users) {
    const personal = Boolean(u.totp?.secret);
    const state = personal ? 'personal 2FA' : envGlobal || global?.secret ? 'FALLBACK to global 2FA' : 'NO 2FA';
    console.log(`  - ${u.username} (${u.role}${u.disabled ? ', disabled' : ''}): ${state}`);
  }
  const pending = users.filter(u => !u.disabled && !u.totp?.secret).length;
  console.log(`[migrate-totp] users without personal 2FA: ${pending}. Ask them to enable it in Settings -> 2FA.`);

  if (apply) {
    const dir = path.join(dataDir, 'backups', `pre-totp-${new Date().toISOString().replace(/[:.]/g, '-')}`);
    await fs.mkdir(dir, { recursive: true });
    for (const p of [adminsPath, globalPath]) {
      try {
        await fs.copyFile(p, path.join(dir, path.basename(p)));
      } catch {
        /* file may not exist */
      }
    }
    console.log(`[migrate-totp] backup written to ${dir}`);
  }
}

main().catch(err => {
  console.error(err);
  process.exit(1);
});
