/**
 * Outbound notifications for leads/orders (Telegram).
 * TELEGRAM_BOT_TOKEN required. Destinations: paired subscribers and/or TELEGRAM_CHAT_ID.
 */

import {
  collectNotifyChatIds,
  hasTelegramSubscribers,
  listTelegramSubscribers,
  type TelegramNotifyKind,
} from './telegram-store';
import { formatLeadPush, formatOrderPush } from './telegram-format';

export type TelegramSendOptions = {
  chatId?: string;
  replyMarkup?: unknown;
  messageId?: number;
};

export function telegramBotToken(): string {
  return process.env.TELEGRAM_BOT_TOKEN?.trim() || '';
}

export function telegramLegacyChatId(): string {
  return process.env.TELEGRAM_CHAT_ID?.trim() || '';
}

/** Token present — bot process / pairing can work. */
export function telegramConfigured(): boolean {
  return Boolean(telegramBotToken());
}

export async function telegramCanSend(): Promise<boolean> {
  if (!telegramBotToken()) return false;
  if (telegramLegacyChatId()) return true;
  return hasTelegramSubscribers();
}

export async function sendTelegramMessage(text: string, options?: TelegramSendOptions): Promise<boolean> {
  const token = telegramBotToken();
  const chatId = (options?.chatId || telegramLegacyChatId()).trim();
  if (!token || !chatId) return false;
  const body: Record<string, unknown> = {
    chat_id: chatId,
    text: text.slice(0, 4000),
    disable_web_page_preview: true,
  };
  if (options?.replyMarkup) body.reply_markup = options.replyMarkup;

  try {
    const url = `https://api.telegram.org/bot${token}/sendMessage`;
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
    if (!res.ok) {
      const errBody = await res.text().catch(() => '');
      console.error('[telegram] send failed', res.status, errBody.slice(0, 200));
      return false;
    }
    return true;
  } catch (err) {
    console.error('[telegram] error', err);
    return false;
  }
}

export async function editTelegramMessage(
  chatId: string,
  messageId: number,
  text: string,
  replyMarkup?: unknown,
): Promise<boolean> {
  const token = telegramBotToken();
  if (!token || !chatId || !Number.isFinite(messageId)) return false;
  const body: Record<string, unknown> = {
    chat_id: chatId,
    message_id: messageId,
    text: text.slice(0, 4000),
    disable_web_page_preview: true,
  };
  if (replyMarkup) body.reply_markup = replyMarkup;
  try {
    const url = `https://api.telegram.org/bot${token}/editMessageText`;
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
    if (!res.ok) {
      const errBody = await res.text().catch(() => '');
      // "message is not modified" is a successful no-op for identical menus
      if (res.status === 400 && errBody.includes('message is not modified')) return true;
      console.error('[telegram] edit failed', res.status, errBody.slice(0, 200));
      return false;
    }
    return true;
  } catch (err) {
    console.error('[telegram] edit error', err);
    return false;
  }
}

export async function answerTelegramCallback(callbackQueryId: string, text?: string): Promise<void> {
  const token = telegramBotToken();
  if (!token || !callbackQueryId) return;
  try {
    await fetch(`https://api.telegram.org/bot${token}/answerCallbackQuery`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        callback_query_id: callbackQueryId,
        text: (text || '').slice(0, 180),
      }),
    });
  } catch (err) {
    console.error('[telegram] answerCallbackQuery', err);
  }
}

export async function broadcastTelegram(text: string, kind: TelegramNotifyKind): Promise<boolean> {
  if (!telegramBotToken()) return false;
  const subs = await listTelegramSubscribers();
  const chats = collectNotifyChatIds(kind, subs, telegramLegacyChatId());
  if (!chats.length) return false;
  let any = false;
  for (const chatId of chats) {
    if (await sendTelegramMessage(text, { chatId })) any = true;
  }
  return any;
}

export async function notifyLead(payload: {
  phone: string;
  leadId?: string;
  pagePath?: string;
  utmLine?: string;
  zone?: string;
  serviceTitle?: string;
  comment?: string;
  source?: string;
  createdAt?: string;
}): Promise<boolean> {
  return broadcastTelegram(
    formatLeadPush({
      phone: payload.phone,
      source: payload.source,
      serviceTitle: payload.serviceTitle,
      comment: payload.comment,
      createdAt: payload.createdAt,
    }),
    'lead',
  );
}

export async function notifyOrder(payload: {
  phone: string;
  productTitle: string;
  price?: number;
  orderId?: string;
  fulfillment?: string;
  comment?: string;
  createdAt?: string;
}): Promise<boolean> {
  return broadcastTelegram(
    formatOrderPush({
      phone: payload.phone,
      productTitle: payload.productTitle,
      price: payload.price,
      fulfillment: payload.fulfillment,
      comment: payload.comment,
      createdAt: payload.createdAt,
    }),
    'order',
  );
}
