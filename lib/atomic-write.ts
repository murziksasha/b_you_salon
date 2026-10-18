import { promises as fs } from 'fs';
import path from 'path';

const RETRYABLE = new Set(['EPERM', 'EBUSY', 'EACCES']);
const MAX_RENAME_ATTEMPTS = 8;

function isRetryable(err: unknown): boolean {
  const code = (err as NodeJS.ErrnoException)?.code;
  return Boolean(code && RETRYABLE.has(code));
}

function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

/**
 * Rename tmp → dest. On Windows, antivirus or a concurrent reader can hold the
 * target and throw EPERM/EBUSY; retry with backoff, then copy+unlink.
 */
async function replaceFile(tmp: string, dest: string): Promise<void> {
  let delay = 20;
  let lastErr: unknown;
  for (let attempt = 0; attempt < MAX_RENAME_ATTEMPTS; attempt++) {
    try {
      await fs.rename(tmp, dest);
      return;
    } catch (err) {
      lastErr = err;
      if (!isRetryable(err) || attempt === MAX_RENAME_ATTEMPTS - 1) break;
      await sleep(delay);
      delay = Math.min(delay * 2, 400);
    }
  }

  if (process.platform === 'win32' && isRetryable(lastErr)) {
    await fs.copyFile(tmp, dest);
    try {
      await fs.unlink(tmp);
    } catch {
      // leftover tmp is harmless; next write uses a unique name
    }
    return;
  }

  throw lastErr;
}

/**
 * Atomic file write: temp file in same directory + rename.
 * Avoids truncated JSON if process crashes mid-write.
 */
export async function atomicWriteFile(
  filePath: string,
  data: string | Buffer,
  options?: { encoding?: BufferEncoding; mode?: number },
): Promise<void> {
  const dir = path.dirname(filePath);
  await fs.mkdir(dir, { recursive: true });

  const base = path.basename(filePath);
  const tmp = path.join(dir, `.${base}.${process.pid}.${Date.now()}.${Math.random().toString(16).slice(2)}.tmp`);

  try {
    if (typeof data === 'string') {
      await fs.writeFile(tmp, data, { encoding: options?.encoding ?? 'utf-8', mode: options?.mode });
    } else {
      await fs.writeFile(tmp, data, { mode: options?.mode });
    }
    await replaceFile(tmp, filePath);
  } catch (err) {
    try {
      await fs.unlink(tmp);
    } catch {
      // ignore cleanup errors
    }
    throw err;
  }
}

export async function atomicWriteJson(filePath: string, value: unknown): Promise<void> {
  await atomicWriteFile(filePath, `${JSON.stringify(value, null, 2)}\n`, { encoding: 'utf-8' });
}
