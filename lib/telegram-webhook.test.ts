import { afterEach, describe, expect, it } from 'vitest';
import {
  isValidTelegramWebhookSecret,
  telegramWebhookMode,
  telegramWebhookSecretMatches,
  telegramWebhookUrl,
} from './telegram-webhook';

describe('telegram webhook helpers', () => {
  const prev: Record<string, string | undefined> = {};

  afterEach(() => {
    for (const key of ['TELEGRAM_WEBHOOK_SECRET', 'TELEGRAM_BOT_TOKEN', 'SITE_URL']) {
      if (prev[key] === undefined) delete process.env[key];
      else process.env[key] = prev[key];
      delete prev[key];
    }
  });

  function setEnv(key: string, value: string | undefined) {
    prev[key] = process.env[key];
    if (value === undefined) delete process.env[key];
    else process.env[key] = value;
  }

  it('validates secret charset', () => {
    expect(isValidTelegramWebhookSecret('abc_DEF-123')).toBe(true);
    expect(isValidTelegramWebhookSecret('')).toBe(false);
    expect(isValidTelegramWebhookSecret('has space')).toBe(false);
  });

  it('matches header with timing-safe compare', () => {
    setEnv('TELEGRAM_WEBHOOK_SECRET', 'hook-secret-1');
    expect(telegramWebhookSecretMatches('hook-secret-1')).toBe(true);
    expect(telegramWebhookSecretMatches('hook-secret-2')).toBe(false);
    expect(telegramWebhookSecretMatches('')).toBe(false);
    expect(telegramWebhookSecretMatches(null)).toBe(false);
  });

  it('builds https public url and prefers webhook mode', () => {
    setEnv('SITE_URL', 'https://beyou.example');
    setEnv('TELEGRAM_BOT_TOKEN', '123:abc');
    setEnv('TELEGRAM_WEBHOOK_SECRET', 'hook-secret-1');
    expect(telegramWebhookUrl()).toBe('https://beyou.example/api/telegram/webhook');
    expect(telegramWebhookMode()).toBe('webhook');

    setEnv('SITE_URL', 'http://localhost:8080');
    expect(telegramWebhookUrl()).toBeUndefined();
    expect(telegramWebhookMode()).toBe('polling');
  });
});
