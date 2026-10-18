import nodemailer from 'nodemailer';
import { appendOrder, type Fulfillment, type Order, type OrderItemSnapshot } from './orders';
import { escapeText } from './sanitize';
import { CONSULT_PRODUCT_TITLE } from './shop-consult';
import { autoNotifyNewOrder } from './telegram-auto-notify';

export async function placeShopOrder(input: {
  phone: string;
  comment?: string;
  name?: string;
  items?: OrderItemSnapshot[];
  fulfillment?: Fulfillment;
  address?: string;
  consult?: boolean;
  pagePath?: string;
}): Promise<{ order: Order | null; emailed: boolean; telegram: boolean; dev: boolean }> {
  const consult = Boolean(input.consult);
  const items = consult ? [] : input.items || [];
  const titleLine = consult
    ? CONSULT_PRODUCT_TITLE
    : items.map((i) => `${i.title} ×${i.qty}`).join(', ');
  const total = consult ? 0 : items.reduce((sum, i) => sum + i.price * i.qty, 0);

  const smtpHost = process.env.SMTP_HOST || 'smtp.gmail.com';
  const smtpUser = process.env.SMTP_USER || '';
  const smtpPass = process.env.SMTP_PASS || '';
  const smtpPort = parseInt(process.env.SMTP_PORT || '465', 10);
  const mailTo = process.env.MAIL_TO || '';
  const mailFrom = process.env.MAIL_FROM || smtpUser || 'no-reply@example.com';
  const siteUrl = (process.env.SITE_URL || '').replace(/\/$/, '');
  const dev = !smtpUser || !smtpPass;

  const safePhone = escapeText(input.phone);
  const safeTitle = escapeText(titleLine);
  const safeComment = input.comment ? escapeText(input.comment) : '—';
  const priceStr = total.toLocaleString('uk-UA');
  const when = new Date().toLocaleString('uk-UA');
  const pagePath = input.pagePath || (consult ? '/' : '/cart');
  const pageLink = siteUrl ? `${siteUrl}${pagePath}` : pagePath;
  const adminUrl = siteUrl ? `${siteUrl}/admin/orders` : undefined;

  let emailed = false;

  if (dev) {
    console.log('[ORDER] submission (no SMTP):', input.phone, titleLine);
  } else {
    try {
      const transporter = nodemailer.createTransport({
        host: smtpHost,
        port: smtpPort,
        secure: smtpPort === 465,
        auth: { user: smtpUser, pass: smtpPass },
      });

      const html = consult
        ? `
        <p>Клієнт залишив заявку на <strong>консультацію по товарах</strong>.</p>
        <p><strong>Телефон:</strong> ${safePhone}</p>
        <p><strong>Коментар:</strong> ${safeComment}</p>
        <p><strong>Час:</strong> ${escapeText(when)}</p>
        <p><strong>Сторінка:</strong> <a href="${escapeText(pageLink)}">${escapeText(pageLink)}</a></p>
        ${adminUrl ? `<p><strong>Журнал:</strong> <a href="${escapeText(adminUrl)}">${escapeText(adminUrl)}</a></p>` : ''}
      `
        : `
        <p>Нове <strong>замовлення</strong> з магазину B_You.</p>
        <p><strong>Телефон:</strong> ${safePhone}</p>
        <p><strong>Імʼя:</strong> ${input.name ? escapeText(input.name) : '—'}</p>
        <p><strong>Отримання:</strong> ${input.fulfillment === 'delivery' ? 'доставка' : 'самовивіз'}</p>
        <p><strong>Адреса:</strong> ${input.address ? escapeText(input.address) : '—'}</p>
        <p><strong>Товари:</strong> ${safeTitle}</p>
        <p><strong>Сума:</strong> ${escapeText(priceStr)} ₴</p>
        <p><strong>Коментар:</strong> ${safeComment}</p>
        <p><strong>Час:</strong> ${escapeText(when)}</p>
        <p><strong>Сторінка:</strong> <a href="${escapeText(pageLink)}">${escapeText(pageLink)}</a></p>
      `;

      const text = consult
        ? [
            'Клієнт залишив заявку на консультацію по товарах.',
            `Телефон: ${input.phone}`,
            `Коментар: ${input.comment || '—'}`,
            `Час: ${when}`,
            `Сторінка: ${pageLink}`,
            adminUrl ? `Журнал: ${adminUrl}` : '',
          ]
            .filter(Boolean)
            .join('\n')
        : [
            'Нове замовлення з магазину B_You.',
            `Телефон: ${input.phone}`,
            `Імʼя: ${input.name || '—'}`,
            `Отримання: ${input.fulfillment === 'delivery' ? 'доставка' : 'самовивіз'}`,
            `Адреса: ${input.address || '—'}`,
            `Товари: ${titleLine}`,
            `Сума: ${priceStr} ₴`,
            `Коментар: ${input.comment || '—'}`,
            `Час: ${when}`,
          ].join('\n');

      await transporter.sendMail({
        from: `"B_You" <${mailFrom}>`,
        to: mailTo,
        subject: consult
          ? `Консультація по товарах · ${input.phone}`
          : `Замовлення B_You · ${priceStr} ₴`,
        html,
        text,
      });
      emailed = true;
    } catch (err) {
      console.error('Order mail error:', err);
    }
  }

  let order = null as Order | null;
  try {
    order = await appendOrder({
      phone: input.phone,
      comment: input.comment || undefined,
      name: input.name || undefined,
      items: consult ? undefined : items,
      fulfillment: consult ? 'pickup' : input.fulfillment,
      address: !consult && input.fulfillment === 'delivery' ? input.address : undefined,
      emailed,
      telegram: false,
      source: consult ? 'consult' : 'shop',
    });
  } catch (err) {
    console.error('[orders] failed to persist', err);
  }

  let telegram = false;
  try {
    telegram = await autoNotifyNewOrder(order);
  } catch {
    telegram = false;
  }

  return { order, emailed, telegram, dev };
}
