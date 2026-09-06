import { NextRequest, NextResponse } from 'next/server';
import { requireAdminRole } from '@/lib/require-role';
import { appendActivity } from '@/lib/admin-activity';
import { telegramBotToken, telegramCanSend, telegramLegacyChatId } from '@/lib/notify';
import {
  createTelegramPairing,
  getTelegramPairing,
  listTelegramSubscribers,
  revokeTelegramSubscriber,
} from '@/lib/telegram-store';

export const dynamic = 'force-dynamic';

export async function GET() {
  const g = await requireAdminRole();
  if (!g.ok) return g.response;

  const [subscribers, pairing, canSend] = await Promise.all([
    listTelegramSubscribers(),
    getTelegramPairing(),
    telegramCanSend(),
  ]);

  return NextResponse.json({
    tokenConfigured: Boolean(telegramBotToken()),
    legacyChat: Boolean(telegramLegacyChatId()),
    canSend,
    pairing,
    subscribers,
  });
}

export async function POST(request: NextRequest) {
  const g = await requireAdminRole();
  if (!g.ok) return g.response;

  let body: { action?: string; userId?: string } = {};
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
