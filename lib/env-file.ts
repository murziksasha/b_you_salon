import { promises as fs } from 'fs';
import path from 'path';
import { atomicWriteFile } from './atomic-write';
import { projectRoot } from './uploads-path';

export const MAIL_ENV_KEYS = [
  'SMTP_HOST',
  'SMTP_PORT',
  'SMTP_USER',
  'SMTP_PASS',
  'MAIL_FROM',
  'MAIL_TO',
] as const;

export type MailEnvKey = (typeof MAIL_ENV_KEYS)[number];
export type MailEnvValues = Record<MailEnvKey, string>;
export type MailEnvPatch = Partial<Record<MailEnvKey, string>>;

const MAIL_KEY_SET = new Set<string>(MAIL_ENV_KEYS);
const BARE_VALUE = /^[A-Za-z0-9_@.+/:\\-]*$/;

export type PublicMailConfig = {
  host: string;
  port: string;
  user: string;
  from: string;
  to: string;
  hasPassword: boolean;
  pendingRestart: boolean;
};

/** `.env` in PROJECT_ROOT, or the process cwd when that variable is unset. */
export function envFilePath(): string {
  return path.join(projectRoot(), '.env');
}

export function emptyMailEnv(): MailEnvValues {
  return {
    SMTP_HOST: '',
    SMTP_PORT: '',
    SMTP_USER: '',
    SMTP_PASS: '',
    MAIL_FROM: '',
    MAIL_TO: '',
  };
}

/** Quote only when a bare token would be ambiguous for the project `.env` readers. */
export function formatEnvValue(value: string): string {
  if (BARE_VALUE.test(value)) return value;
  if (!value.includes("'") && !/[\r\n]/.test(value)) return `'${value}'`;
  const escaped = value
    .replace(/\\/g, '\\\\')
    .replace(/"/g, '\\"')
    .replace(/\r/g, '\\r')
    .replace(/\n/g, '\\n');
  return `"${escaped}"`;
}

function unquoteEnvValue(value: string): string {
  if (
    value.length >= 2 &&
    ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'")))
  ) {
    return value.slice(1, -1);
  }
  return value;
}

function parseAssignment(line: string): { key: string; value: string; exportPrefix: boolean } | null {
  const trimmed = line.trim();
  if (!trimmed || trimmed.startsWith('#')) return null;
  let body = trimmed;
  let exportPrefix = false;
  if (body.startsWith('export ')) {
    exportPrefix = true;
    body = body.slice('export '.length).trim();
  }
  const eq = body.indexOf('=');
  if (eq <= 0) return null;
  const key = body.slice(0, eq).trim();
  if (!/^[A-Za-z_][A-Za-z0-9_]*$/.test(key)) return null;
  return { key, value: unquoteEnvValue(body.slice(eq + 1).trim()), exportPrefix };
}

/** Last assignment wins, matching dotenv and `ecosystem.config.cjs`. */
export function readMailValues(source: string): MailEnvValues {
  const values = emptyMailEnv();
  for (const line of source.split(/\r?\n/)) {
    const parsed = parseAssignment(line);
    if (!parsed || !MAIL_KEY_SET.has(parsed.key)) continue;
    values[parsed.key as MailEnvKey] = parsed.value;
  }
  return values;
}

/**
 * Replace or append only the mail keys present in `patch`.
 * Comments, blank lines, and every other assignment stay as they were.
 * A key omitted from `patch` (including SMTP_PASS) is left untouched.
 */
export function mergeEnvText(source: string, patch: MailEnvPatch): string {
  const newline = source.includes('\r\n') ? '\r\n' : '\n';
  const lines = source.split(/\r?\n/);
  if (source.endsWith('\n')) lines.pop();

  const seen = new Set<string>();
  const out: string[] = [];
  for (const line of lines) {
    const parsed = parseAssignment(line);
    if (parsed && MAIL_KEY_SET.has(parsed.key) && Object.prototype.hasOwnProperty.call(patch, parsed.key)) {
      const key = parsed.key as MailEnvKey;
      const prefix = parsed.exportPrefix ? 'export ' : '';
      out.push(`${prefix}${key}=${formatEnvValue(patch[key] ?? '')}`);
      seen.add(key);
      continue;
    }
    out.push(line);
  }

  for (const key of MAIL_ENV_KEYS) {
    if (!Object.prototype.hasOwnProperty.call(patch, key) || seen.has(key)) continue;
    out.push(`${key}=${formatEnvValue(patch[key] ?? '')}`);
  }

  if (out.length === 0) return '';
  return `${out.join(newline)}${newline}`;
}

export function toPublicMailConfig(
  values: MailEnvValues,
  env: Record<string, string | undefined> = process.env,
): PublicMailConfig {
  const pendingRestart = MAIL_ENV_KEYS.some((key) => values[key] !== (env[key] ?? ''));
  return {
    host: values.SMTP_HOST,
    port: values.SMTP_PORT,
    user: values.SMTP_USER,
    from: values.MAIL_FROM,
    to: values.MAIL_TO,
    hasPassword: values.SMTP_PASS.length > 0,
    pendingRestart,
  };
}

export async function readMailConfig(): Promise<PublicMailConfig> {
  let source = '';
  try {
    source = await fs.readFile(envFilePath(), 'utf8');
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code !== 'ENOENT') throw err;
  }
  return toPublicMailConfig(readMailValues(source));
}

export async function writeMailEnv(patch: MailEnvPatch): Promise<PublicMailConfig> {
  const filePath = envFilePath();
  let source = '';
  try {
    source = await fs.readFile(filePath, 'utf8');
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code !== 'ENOENT') throw err;
  }
  const next = mergeEnvText(source, patch);
  await atomicWriteFile(filePath, next, { encoding: 'utf8' });
  return toPublicMailConfig(readMailValues(next));
}
