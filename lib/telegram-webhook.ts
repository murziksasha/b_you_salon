import { timingSafeEqual } from 'crypto';
import { originFromEnv } from './public-site-url';
import { telegramBotToken } from './notify';

const SECRET_RE = /^[A-Za-z0-9_-]{1,256}$/;

export function telegramWebhookSecret(): string {
  return process.env.TELEGRAM_WEBHOOK_SECRET?.trim() || '';
}

export function isValidTelegramWebhookSecret(value: string): boolean {
  return SECRET_RE.test(value);
}

export function telegramWebhookUrl(): string | undefined {
  const origin = originFromEnv();
  if (!origin) return undefined;
  if (!origin.startsWith('https://')) return undefined;
  return `${origin}/api/telegram/webhook`;
}

export function telegramWebhookReady(): boolean {
  const secret = telegramWebhookSecret();
  return Boolean(telegramBotToken() && secret && isValidTelegramWebhookSecret(secret) && telegramWebhookUrl());
}

export function telegramWebhookMode(): 'webhook' | 'polling' {
  return telegramWebhookReady() ? 'webhook' : 'polling';
}

export function telegramWebhookSecretMatches(header: string | null | undefined): boolean {
  const secret = telegramWebhookSecret();
  if (!secret || !isValidTelegramWebhookSecret(secret)) return false;
  const got = (header || '').trim();
  const a = Buffer.from(got);
  const b = Buffer.from(secret);
  if (a.length !== b.length) return false;
  return timingSafeEqual(a, b);
}

type TelegramApiResult = { ok: boolean; description?: string; result?: unknown };

async function telegramMethod(method: string, body?: Record<string, unknown>): Promise<TelegramApiResult> {
  const token = telegramBotToken();
  if (!token) return { ok: false, description: 'TELEGRAM_BOT_TOKEN is not set' };
  try {
    const res = await fetch(`https://api.telegram.org/bot${token}/${method}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body || {}),
      signal: AbortSignal.timeout(15_000),
    });
    const json = (await res.json().catch(() => null)) as TelegramApiResult | null;
    if (!json) return { ok: false, description: `HTTP ${res.status}` };
    return json;
  } catch (err) {
    return { ok: false, description: err instanceof Error ? err.message : 'network error' };
  }
}

export async function setTelegramWebhook(): Promise<{ ok: boolean; url?: string; error?: string }> {
  const url = telegramWebhookUrl();
  const secret = telegramWebhookSecret();
  if (!url) return { ok: false, error: 'Потрібен публічний https SITE_URL' };
  if (!secret || !isValidTelegramWebhookSecret(secret)) {
    return { ok: false, error: 'TELEGRAM_WEBHOOK_SECRET має бути 1–256 символів A-Za-z0-9_-' };
  }
  if (!telegramBotToken()) return { ok: false, error: 'TELEGRAM_BOT_TOKEN не задано' };
  const json = await telegramMethod('setWebhook', {
    url,
    secret_token: secret,
    allowed_updates: ['message', 'callback_query'],
    drop_pending_updates: false,
  });
  if (!json.ok) return { ok: false, url, error: json.description || 'setWebhook failed' };
  return { ok: true, url };
}

export async function deleteTelegramWebhook(): Promise<{ ok: boolean; error?: string }> {
  const json = await telegramMethod('deleteWebhook', { drop_pending_updates: false });
  if (!json.ok) return { ok: false, error: json.description || 'deleteWebhook failed' };
  return { ok: true };
}

export async function getTelegramWebhookInfo(): Promise<{
  url?: string;
  pending?: number;
  lastError?: string;
}> {
  const json = await telegramMethod('getWebhookInfo');
  const result = json.result as { url?: string; pending_update_count?: number; last_error_message?: string } | undefined;
  return {
    url: result?.url || '',
    pending: result?.pending_update_count,
    lastError: result?.last_error_message,
  };
}

export async function registerTelegramWebhookOnBoot(): Promise<void> {
  if (!telegramWebhookReady()) return;
  const result = await setTelegramWebhook();
  if (result.ok) {
    console.log('[telegram] webhook registered', result.url);
  } else {
    console.error('[telegram] webhook register failed', result.error);
  }
}
