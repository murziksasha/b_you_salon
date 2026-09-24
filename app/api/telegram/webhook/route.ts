import { NextRequest, NextResponse } from 'next/server';
import { clientKey, rateLimit } from '@/lib/rate-limit';
import { processTelegramUpdate, type TelegramUpdate } from '@/lib/telegram-poll';
import { telegramWebhookSecret, telegramWebhookSecretMatches } from '@/lib/telegram-webhook';

export const dynamic = 'force-dynamic';

export async function POST(request: NextRequest) {
  if (!telegramWebhookSecret()) {
    return NextResponse.json({ error: 'Webhook not configured' }, { status: 503 });
  }
  if (!telegramWebhookSecretMatches(request.headers.get('x-telegram-bot-api-secret-token'))) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
  const rl = rateLimit(clientKey(request, 'tg-webhook'), { limit: 60, windowMs: 60_000 });
  if (!rl.allowed) {
    return NextResponse.json({ error: 'Too many requests' }, { status: 429 });
  }

  let update: TelegramUpdate;
  try {
    update = (await request.json()) as TelegramUpdate;
  } catch {
    return NextResponse.json({ error: 'Bad request' }, { status: 400 });
  }

  try {
    await processTelegramUpdate(update);
  } catch (err) {
    console.error('[telegram-webhook]', err);
  }
  return NextResponse.json({ ok: true });
}
