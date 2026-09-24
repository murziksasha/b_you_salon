import { NextRequest, NextResponse } from 'next/server';
import { requireAdminRole } from '@/lib/require-role';
import { appendActivity } from '@/lib/admin-activity';
import { telegramBotToken, telegramCanSend, telegramLegacyChatId } from '@/lib/notify';
import {
  createTelegramPairing,
  getTelegramBotSettings,
  getTelegramPairing,
  listTelegramSubscribers,
  patchTelegramBotSettings,
  revokeTelegramSubscriber,
} from '@/lib/telegram-store';
import {
  deleteTelegramWebhook,
  getTelegramWebhookInfo,
  setTelegramWebhook,
  telegramWebhookMode,
  telegramWebhookSecret,
  telegramWebhookUrl,
} from '@/lib/telegram-webhook';

export const dynamic = 'force-dynamic';

export async function GET() {
  const g = await requireAdminRole('telegram');
  if (!g.ok) return g.response;

  const [subscribers, pairing, canSend, settings, hookInfo] = await Promise.all([
    listTelegramSubscribers(),
    getTelegramPairing(),
    telegramCanSend(),
    getTelegramBotSettings(),
    getTelegramWebhookInfo().catch(() => ({ url: '', pending: 0, lastError: undefined })),
  ]);

  return NextResponse.json({
    tokenConfigured: Boolean(telegramBotToken()),
    legacyChat: Boolean(telegramLegacyChatId()),
    canSend,
    pairing,
    subscribers,
    settings: {
      quietStart: settings.quietStart,
      quietEnd: settings.quietEnd,
      timezone: settings.timezone,
    },
    webhook: {
      secretConfigured: Boolean(telegramWebhookSecret()),
      expectedUrl: telegramWebhookUrl() || null,
      mode: telegramWebhookMode(),
      telegramUrl: hookInfo.url || '',
      lastError: hookInfo.lastError || '',
      pending: hookInfo.pending || 0,
    },
  });
}

export async function POST(request: NextRequest) {
  const g = await requireAdminRole('telegram');
  if (!g.ok) return g.response;

  let body: { action?: string; userId?: string; quietStart?: number; quietEnd?: number } = {};
  try {
    body = (await request.json()) as { action?: string; userId?: string };
  } catch {
    return NextResponse.json({ error: 'Bad request' }, { status: 400 });
  }

  if (body.action === 'pair') {
    if (!telegramBotToken()) {
      return NextResponse.json({ error: 'TELEGRAM_BOT_TOKEN не задано в .env' }, { status: 503 });
    }
    const pairing = await createTelegramPairing(g.username);
    try {
      await appendActivity({
        kind: 'security',
        message: 'Telegram: згенеровано код привʼязки',
        actor: g.username,
      });
    } catch {
      /* ignore */
    }
    return NextResponse.json({ ok: true, pairing });
  }

  if (body.action === 'quiet') {
    const settings = await patchTelegramBotSettings({
      quietStart: body.quietStart,
      quietEnd: body.quietEnd,
    });
    try {
      await appendActivity({
        kind: 'settings',
        message: `Telegram тихі години ${settings.quietStart}–${settings.quietEnd} ${settings.timezone}`,
        actor: g.username,
      });
    } catch {
      /* ignore */
    }
    return NextResponse.json({ ok: true, settings });
  }

  if (body.action === 'webhook_on') {
    const result = await setTelegramWebhook();
    if (!result.ok) {
      return NextResponse.json({ error: result.error || 'Не вдалося увімкнути webhook' }, { status: 400 });
    }
    try {
      await appendActivity({
        kind: 'settings',
        message: `Telegram webhook: ${result.url}`,
        actor: g.username,
      });
    } catch {
      /* ignore */
    }
    return NextResponse.json({ ok: true, webhook: result });
  }

  if (body.action === 'webhook_off') {
    const result = await deleteTelegramWebhook();
    if (!result.ok) {
      return NextResponse.json({ error: result.error || 'Не вдалося вимкнути webhook' }, { status: 400 });
    }
    try {
      await appendActivity({
        kind: 'settings',
        message: 'Telegram webhook вимкнено (polling)',
        actor: g.username,
      });
    } catch {
      /* ignore */
    }
    return NextResponse.json({ ok: true });
  }

  if (body.action === 'revoke') {
    const userId = typeof body.userId === 'string' ? body.userId.trim() : '';
    if (!userId) return NextResponse.json({ error: 'userId required' }, { status: 400 });
    const ok = await revokeTelegramSubscriber(userId);
    if (!ok) return NextResponse.json({ error: 'Not found' }, { status: 404 });
    try {
      await appendActivity({
        kind: 'security',
        message: `Telegram: відкликано підписника ${userId}`,
        actor: g.username,
      });
    } catch {
      /* ignore */
    }
    return NextResponse.json({ ok: true });
  }

  return NextResponse.json({ error: 'Unknown action' }, { status: 400 });
}
