import { promises as fs } from 'fs';
import path from 'path';
import { atomicWriteJson } from './atomic-write';

export interface AdminTotpRecord {
  secret: string;
  enabledAt: string;
}

function dataDir(): string {
  return process.env.DATA_DIR || path.join(process.cwd(), 'data');
}

export function adminTotpFilePath(): string {
  return path.join(dataDir(), 'admin-totp.json');
}

/** Read file-based TOTP secret (not env). Returns null if missing/invalid. */
export async function readAdminTotpRecord(): Promise<AdminTotpRecord | null> {
  try {
    const raw = await fs.readFile(adminTotpFilePath(), 'utf-8');
    const parsed = JSON.parse(raw) as Partial<AdminTotpRecord>;
    const secret = typeof parsed.secret === 'string' ? parsed.secret.trim() : '';
    if (!secret) return null;
    return {
      secret,
      enabledAt: typeof parsed.enabledAt === 'string' ? parsed.enabledAt : '',
    };
  } catch {
    return null;
  }
}

export async function writeAdminTotpSecret(secret: string): Promise<AdminTotpRecord> {
  const record: AdminTotpRecord = {
    secret: secret.trim().toUpperCase().replace(/\s+/g, ''),
    enabledAt: new Date().toISOString(),
  };
  await atomicWriteJson(adminTotpFilePath(), record);
  try {
    await fs.chmod(adminTotpFilePath(), 0o600);
  } catch {
    // Windows / some FS ignore mode
  }
  return record;
}

export async function deleteAdminTotpSecret(): Promise<void> {
  try {
    await fs.unlink(adminTotpFilePath());
  } catch (err) {
    const code = (err as NodeJS.ErrnoException)?.code;
    if (code !== 'ENOENT') throw err;
  }
}
