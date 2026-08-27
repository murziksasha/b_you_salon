/**
 * Outbound notifications for leads/orders (Telegram).
 * Configure TELEGRAM_BOT_TOKEN + TELEGRAM_CHAT_ID.
 */

export async function sendTelegramMessage(text: string): Promise<boolean> {
  const token = process.env.TELEGRAM_BOT_TOKEN?.trim();
  const chatId = process.env.TELEGRAM_CHAT_ID?.trim();
  if (!token || !chatId) return false;

  try {
    const url = `https://api.telegram.org/bot${token}/sendMessage`;
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        chat_id: chatId,
        text: text.slice(0, 4000),
        disable_web_page_preview: true,
      }),
    });
    if (!res.ok) {
      const body = await res.text().catch(() => '');
      console.error('[telegram] send failed', res.status, body.slice(0, 200));
      return false;
    }
    return true;
  } catch (err) {
    console.error('[telegram] error', err);
    return false;
  }
}

export function telegramConfigured(): boolean {
  return Boolean(process.env.TELEGRAM_BOT_TOKEN?.trim() && process.env.TELEGRAM_CHAT_ID?.trim());
}

export async function notifyLead(payload: {
  phone: string;
  leadId?: string;
  pagePath?: string;
  utmLine?: string;
  zone?: string;
  serviceTitle?: string;
  comment?: string;
}): Promise<boolean> {
  const lines = [
    '📞 Нова заявка B_You',
    payload.zone === 'salon' ? 'Зона: салон' : payload.zone === 'shop' ? 'Зона: магазин' : '',
    `Телефон: ${payload.phone}`,
    payload.serviceTitle ? `Послуга: ${payload.serviceTitle}` : '',
    payload.comment ? `Коментар: ${payload.comment}` : '',
    payload.leadId ? `ID: ${payload.leadId}` : '',
    payload.pagePath ? `Сторінка: ${payload.pagePath}` : '',
    payload.utmLine && payload.utmLine !== '—' ? `UTM: ${payload.utmLine}` : '',
    `Час: ${new Date().toLocaleString('uk-UA')}`,
  ].filter(Boolean);
  return sendTelegramMessage(lines.join('\n'));
}

export async function notifyOrder(payload: {
  phone: string;
  productTitle: string;
  price?: number;
  orderId?: string;
  fulfillment?: string;
}): Promise<boolean> {
  const lines = [
    '🛒 Нове замовлення B_You',
    `Телефон: ${payload.phone}`,
    `Товари: ${payload.productTitle}`,
    typeof payload.price === 'number' ? `Сума: ${payload.price.toLocaleString('uk-UA')} ₴` : '',
    payload.fulfillment === 'delivery' ? 'Отримання: доставка' : 'Отримання: самовивіз',
    payload.orderId ? `ID: ${payload.orderId}` : '',
    `Час: ${new Date().toLocaleString('uk-UA')}`,
  ].filter(Boolean);
  return sendTelegramMessage(lines.join('\n'));
}
