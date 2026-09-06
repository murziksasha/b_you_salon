import { handleTelegramContext, type TelegramContext } from './telegram-commands';
import { answerTelegramCallback, editTelegramMessage, sendTelegramMessage, telegramBotToken } from './notify';
import { runCatchupIfNeeded, tickTelegramDigest } from './telegram-digest';
import { getTelegramLastUpdateId, setTelegramLastUpdateId } from './telegram-store';

type TelegramUpdate = {
  update_id: number;
  message?: {
    text?: string;
    chat?: { id: number };
    from?: { id: number; username?: string; first_name?: string };
  };
  callback_query?: {
    id: string;
    data?: string;
    from?: { id: number; username?: string; first_name?: string };
    message?: { chat?: { id: number }; message_id?: number };
  };
};

function contextFromUpdate(update: TelegramUpdate): TelegramContext | null {
  if (update.callback_query) {
    const q = update.callback_query;
    const userId = q.from?.id != null ? String(q.from.id) : '';
    const chatId = q.message?.chat?.id != null ? String(q.message.chat.id) : userId;
    if (!userId || !chatId) return null;
    return {
      userId,
      chatId,
      username: q.from?.username,
      firstName: q.from?.first_name,
      callbackData: q.data,
      messageId: q.message?.message_id,
    };
  }
  const msg = update.message;
  if (!msg) return null;
  const userId = msg.from?.id != null ? String(msg.from.id) : '';
  const chatId = msg.chat?.id != null ? String(msg.chat.id) : '';
  if (!userId || !chatId) return null;
  return {
    userId,
    chatId,
    username: msg.from?.username,
    firstName: msg.from?.first_name,
    text: msg.text,
  };
}

async function telegramApi(method: string, body?: Record<string, unknown>): Promise<unknown> {
  const token = telegramBotToken();
  if (!token) return null;
  const url = `https://api.telegram.org/bot${token}/${method}`;
  const timeoutMs = method === 'getUpdates' ? 35_000 : 15_000;
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body || {}),
    signal: AbortSignal.timeout(timeoutMs),
  });
  const json = (await res.json().catch(() => null)) as { ok?: boolean; result?: unknown; description?: string } | null;
  if (!res.ok || !json?.ok) {
    console.error('[telegram-bot]', method, res.status, json?.description || '');
    return null;
  }
  return json.result;
}

export async function processTelegramUpdate(update: TelegramUpdate): Promise<void> {
  const ctx = contextFromUpdate(update);
  if (!ctx) return;
  const result = await handleTelegramContext(ctx);
  let edited = false;
  for (const reply of result.replies) {
    if (reply.edit && ctx.messageId && !edited) {
      const ok = await editTelegramMessage(ctx.chatId, ctx.messageId, reply.text, reply.replyMarkup);
      edited = true;
      if (ok) continue;
    }
    await sendTelegramMessage(reply.text, { chatId: ctx.chatId, replyMarkup: reply.replyMarkup });
  }
  if (update.callback_query?.id) {
    await answerTelegramCallback(update.callback_query.id, result.callbackAnswer);
  }
}

export async function runTelegramBot(opts?: { signal?: AbortSignal }): Promise<void> {
  const token = telegramBotToken();
  if (!token) {
    console.warn('[telegram-bot] TELEGRAM_BOT_TOKEN is not set; idle until restart');
    await new Promise<void>((resolve) => {
      if (opts?.signal) {
        if (opts.signal.aborted) return resolve();
        opts.signal.addEventListener('abort', () => resolve(), { once: true });
      }
    });
    return;
  }

  await telegramApi('deleteWebhook', { drop_pending_updates: false });
  let offset = (await getTelegramLastUpdateId().catch(() => undefined)) ?? 0;
  if (offset) offset += 1;
  console.log('[telegram-bot] polling started');

  try {
    await runCatchupIfNeeded();
    await tickTelegramDigest();
  } catch (err) {
    console.error('[telegram-bot] startup digest', err);
  }

  while (!opts?.signal?.aborted) {
    try {
      const result = await telegramApi('getUpdates', {
        offset: offset || undefined,
        timeout: 25,
        allowed_updates: ['message', 'callback_query'],
      });
      const updates = Array.isArray(result) ? (result as TelegramUpdate[]) : [];
      for (const update of updates) {
        if (opts?.signal?.aborted) return;
        try {
          await processTelegramUpdate(update);
        } catch (err) {
          console.error('[telegram-bot] update failed', err);
        }
        offset = update.update_id + 1;
        await setTelegramLastUpdateId(update.update_id).catch((err) => {
          console.error('[telegram-bot] persist offset', err);
        });
      }
      await tickTelegramDigest().catch((err) => {
        console.error('[telegram-bot] digest tick', err);
      });
    } catch (err) {
      console.error('[telegram-bot] getUpdates', err);
      await new Promise((r) => setTimeout(r, 3000));
    }
  }
}
