import { promises as fs } from 'fs';
import path from 'path';

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
  const tmp = path.join(dir, `.${base}.${process.pid}.${Date.now()}.tmp`);

  try {
    if (typeof data === 'string') {
      await fs.writeFile(tmp, data, { encoding: options?.encoding ?? 'utf-8', mode: options?.mode });
    } else {
      await fs.writeFile(tmp, data, { mode: options?.mode });
    }
    await fs.rename(tmp, filePath);
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
