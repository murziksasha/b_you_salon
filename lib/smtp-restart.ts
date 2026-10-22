import { spawn, type ChildProcess } from 'child_process';
import path from 'path';
import { projectRoot } from './uploads-path';

export type RestartCheck =
  | { ok: true; root: string }
  | { ok: false; status: number; error: string };

const PM2_MISSING =
  'pm2 не знайдено. .env не змінювався — перезапустіть вручну: pm2 restart ecosystem.config.cjs --update-env';
const PM2_ABSENT = 'Процес pm2 «byou» не знайдено. Перезапуск скасовано, .env не змінювався.';
const PM2_UNPROVEN = 'Не вдалося перевірити каталог процесу byou. Перезапуск скасовано.';
const PM2_OTHER = 'Процес byou запущено з іншого каталогу. Ця адмінка його не перезапускає.';

export function pathLooksTruncated(value: string): boolean {
  return value.includes('…') || /\.{3}$/.test(value);
}

export function sameDirectory(a: string, b: string): boolean {
  const norm = (p: string) => path.resolve(p).replace(/[\\/]+$/u, '');
  const left = norm(a);
  const right = norm(b);
  return process.platform === 'win32' ? left.toLowerCase() === right.toLowerCase() : left === right;
}

/** Pull `exec cwd` cells from `pm2 describe` table output. Truncated cells are kept for the caller to reject. */
export function execCwdsFromPm2Describe(stdout: string): string[] {
  const cwds: string[] = [];
  for (const line of stdout.split(/\r?\n/)) {
    const match = line.match(/exec cwd\s*[|│┃]\s*(.*?)\s*[|│┃]\s*$/i);
    if (!match) continue;
    const value = match[1].trim();
    if (value && value !== 'N/A') cwds.push(value);
  }
  return cwds;
}

/** `pm2 jlist` includes the full process env. Callers must not log or return this stdout. */
export function byouCwdsFromJlist(stdout: string): string[] | null {
  const start = stdout.indexOf('[');
  const end = stdout.lastIndexOf(']');
  if (start < 0 || end < start) return null;
  let parsed: unknown;
  try {
    parsed = JSON.parse(stdout.slice(start, end + 1));
  } catch {
    return null;
  }
  if (!Array.isArray(parsed)) return null;
  const cwds: string[] = [];
  for (const item of parsed) {
    if (!item || typeof item !== 'object') continue;
    const rec = item as { name?: unknown; pm_cwd?: unknown; pm2_env?: { pm_cwd?: unknown } };
    if (rec.name !== 'byou') continue;
    const cwd = rec.pm2_env?.pm_cwd ?? rec.pm_cwd;
    if (typeof cwd === 'string' && cwd.trim()) cwds.push(cwd.trim());
  }
  return cwds;
}

export function isPm2BinaryMissing(stderr: string, code: number): boolean {
  if (code === 0) return false;
  return /is not recognized|command not found|No such file or directory/i.test(stderr);
}

export function decidePm2Restart(input: {
  projectRoot: string;
  pm2Missing?: boolean;
  describeFailed?: boolean;
  describeCwds: string[];
  /** null = jlist unavailable, fall back to a non-truncated describe cwd. */
  jlistCwds: string[] | null;
}): RestartCheck {
  if (input.pm2Missing) return { ok: false, status: 500, error: PM2_MISSING };
  if (input.describeFailed) return { ok: false, status: 409, error: PM2_ABSENT };

  const cwds =
    input.jlistCwds === null ? input.describeCwds.filter((cwd) => !pathLooksTruncated(cwd)) : input.jlistCwds;

  if (cwds.length === 0) return { ok: false, status: 409, error: PM2_UNPROVEN };
  if (!cwds.every((cwd) => sameDirectory(cwd, input.projectRoot))) {
    return { ok: false, status: 409, error: PM2_OTHER };
  }
  return { ok: true, root: input.projectRoot };
}

function runPm2(args: string[]): Promise<{ stdout: string; stderr: string; code: number }> {
  return new Promise((resolve, reject) => {
    const child = spawnPm2(args, projectRoot(), false);
    let stdout = '';
    let stderr = '';
    const timer = setTimeout(() => {
      child.kill();
    }, 20_000);
    child.stdout?.setEncoding('utf8');
    child.stderr?.setEncoding('utf8');
    child.stdout?.on('data', (chunk: string) => {
      stdout += chunk;
    });
    child.stderr?.on('data', (chunk: string) => {
      stderr += chunk;
    });
    child.on('error', (err) => {
      clearTimeout(timer);
      reject(err);
    });
    child.on('close', (code) => {
      clearTimeout(timer);
      resolve({ stdout, stderr, code: code ?? 1 });
    });
  });
}

function spawnPm2(args: string[], cwd: string, detached: boolean): ChildProcess {
  if (process.platform === 'win32') {
    return spawn(process.env.ComSpec || 'cmd.exe', ['/d', '/s', '/c', 'pm2', ...args], {
      cwd,
      detached,
      stdio: detached ? 'ignore' : 'pipe',
      windowsHide: true,
    });
  }
  return spawn('pm2', args, {
    cwd,
    detached,
    stdio: detached ? 'ignore' : 'pipe',
  });
}

/**
 * Confirm `pm2 describe byou` belongs to this project, then allow a restart.
 * Dev admin must not retarget a production `byou` that lives in another cwd.
 */
export async function checkByouProject(): Promise<RestartCheck> {
  const root = projectRoot();
  let described: { stdout: string; stderr: string; code: number };
  try {
    described = await runPm2(['describe', 'byou']);
  } catch (err) {
    const code = (err as NodeJS.ErrnoException).code;
    if (code === 'ENOENT') {
      return decidePm2Restart({ projectRoot: root, pm2Missing: true, describeCwds: [], jlistCwds: null });
    }
    return { ok: false, status: 500, error: 'Не вдалося викликати pm2. .env не змінювався.' };
  }

  if (isPm2BinaryMissing(described.stderr, described.code)) {
    return decidePm2Restart({ projectRoot: root, pm2Missing: true, describeCwds: [], jlistCwds: null });
  }
  if (described.code !== 0) {
    return decidePm2Restart({ projectRoot: root, describeFailed: true, describeCwds: [], jlistCwds: null });
  }

  let jlistCwds: string[] | null = null;
  try {
    const listed = await runPm2(['jlist']);
    if (listed.code === 0) jlistCwds = byouCwdsFromJlist(listed.stdout);
  } catch {
    jlistCwds = null;
  }

  return decidePm2Restart({
    projectRoot: root,
    describeCwds: execCwdsFromPm2Describe(described.stdout),
    jlistCwds,
  });
}

/** `pm2 restart ecosystem.config.cjs --update-env` for this project. Caller runs this after the HTTP response. */
export function startProjectPm2Restart(root: string): void {
  const child = spawnPm2(['restart', 'ecosystem.config.cjs', '--update-env'], root, true);
  child.on('error', (err) => {
    console.error('[smtp-restart] pm2 spawn error', (err as NodeJS.ErrnoException).code || err.message);
  });
  child.unref();
}
