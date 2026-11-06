import { NextRequest, NextResponse } from 'next/server';
import nodemailer from 'nodemailer';
import { appendLead, findOpenLeadsByPhone, updateLead } from '@/lib/leads';
import { getSiteData } from '@/lib/site-data';
import { parseFormIntent, resolveFormFlow, resolveLeadSource, resolveLeadZone } from '@/lib/form-flow';
import {
  absoluteSiteUrl,
  sanitizePagePath,
  sanitizePageTitle,
  truncateMeta,
} from '@/lib/page-path';
import { placeShopOrder } from '@/lib/place-shop-order';
import { autoNotifyNewLead } from '@/lib/telegram-auto-notify';
import { isTrustProxy, rateLimit, rateLimitAdaptive } from '@/lib/rate-limit';
import { clientIpFromHeaders } from '@/lib/admin-ip';
import { escapeText } from '@/lib/sanitize';
import { isValidUaPhone, normalizePhoneCanonical } from '@/lib/phone';
import { formatUtmLine, mergeUtm, parseUtmFromBody, parseUtmFromPagePath } from '@/lib/utm';
import { formatKyivDateTime } from '@/lib/quiet-hours';

function clientIp(request: NextRequest): string {
  if (!isTrustProxy()) return 'direct';
  return clientIpFromHeaders(request.headers) || 'unknown';
}

export async function POST(request: NextRequest) {
  const rl = rateLimitAdaptive(request, 'contact', { clientLimit: 8, globalCeiling: 64, windowMs: 60_000 });
  if (!rl.allowed) {
    const retryAfter = Math.ceil(rl.retryAfterMs / 1000) || 60;
    return NextResponse.json(
      { error: 'Too many requests', retryAfter },
      { status: 429, headers: { 'Retry-After': String(retryAfter) } },
    );
  }

  try {
    let phone = '';
    let pagePathRaw: unknown;
    let pageTitleRaw: unknown;
    let honeypot = '';
    let bodyUtm = {};
    let serviceIdRaw = '';
    let commentRaw = '';
    let intentRaw: unknown;

    const contentType = request.headers.get('content-type') || '';
    if (contentType.includes('application/json')) {
      const body = await request.json();
      phone = typeof body.phone === 'string' ? body.phone : '';
      pagePathRaw = body.pagePath;
      pageTitleRaw = body.pageTitle;
      honeypot = typeof body.website === 'string' ? body.website : '';
      serviceIdRaw = typeof body.serviceId === 'string' ? body.serviceId : '';
      commentRaw = typeof body.comment === 'string' ? body.comment : '';
      intentRaw = body.intent;
      bodyUtm = parseUtmFromBody(body as Record<string, unknown>);
    } else {
      const formData = await request.formData();
      phone = String(formData.get('phone') || '');
      pagePathRaw = formData.get('pagePath');
      pageTitleRaw = formData.get('pageTitle');
      honeypot = String(formData.get('website') || '');
      serviceIdRaw = String(formData.get('serviceId') || '');
      commentRaw = String(formData.get('comment') || '');
      intentRaw = formData.get('intent');
      bodyUtm = parseUtmFromBody({
        utm_source: formData.get('utm_source'),
        utm_medium: formData.get('utm_medium'),
        utm_campaign: formData.get('utm_campaign'),
        utm_content: formData.get('utm_content'),
        utm_term: formData.get('utm_term'),
      });
    }

    // Honeypot: bots that fill hidden field get soft success
    if (honeypot.trim()) {
      return NextResponse.json({ ok: true, emailed: false });
    }

    phone = normalizePhoneCanonical(phone);

    if (!phone) {
      return NextResponse.json({ error: 'Missing phone' }, { status: 400 });
    }

    if (!isValidUaPhone(phone)) {
      return NextResponse.json({ error: 'Invalid phone' }, { status: 400 });
    }

    const phoneRl = rateLimit(`contact:phone:${phone}`, { limit: 5, windowMs: 600_000 });
    if (!phoneRl.allowed) {
      const retryAfter = Math.ceil(phoneRl.retryAfterMs / 1000) || 60;
      return NextResponse.json(
        { error: 'Too many requests for this phone', retryAfter },
        { status: 429, headers: { 'Retry-After': String(retryAfter) } },
      );
    }

    const pagePath = sanitizePagePath(pagePathRaw);
    const pageTitle = sanitizePageTitle(pageTitleRaw);
    const intent = parseFormIntent(intentRaw);
    const flow = resolveFormFlow({ pagePath, intent });
    const zone = resolveLeadZone(pagePath || '/', intent);
    const comment = commentRaw.trim().slice(0, 1000);

    if (flow === 'sales') {
      const placed = await placeShopOrder({
        phone,
        comment: comment || undefined,
        consult: true,
        pagePath: pagePath || undefined,
      });
      if (!placed.order) {
        return NextResponse.json({ error: 'Failed to save order' }, { status: 500 });
      }
      return NextResponse.json({
        ok: true,
        emailed: placed.emailed,
        telegram: placed.telegram,
        orderId: placed.order.id,
        consult: true,
        dev: placed.dev,
      });
    }
    let serviceId: string | undefined;
    let serviceTitle: string | undefined;
    if (serviceIdRaw.trim()) {
      try {
        const site = await getSiteData();
        const svc = (site.services || []).find((s) => s.id === serviceIdRaw.trim() && s.visible);
        if (svc) {
          serviceId = svc.id;
          serviceTitle = svc.title;
        }
      } catch {
        /* ignore */
      }
    }
    const utm = mergeUtm(parseUtmFromPagePath(pagePath), bodyUtm);
    const utmLine = formatUtmLine(utm);
    const ip = clientIp(request);
    const userAgent = truncateMeta(request.headers.get('user-agent'), 200);
    const referer = truncateMeta(request.headers.get('referer'), 300);
    const language = truncateMeta(
      (request.headers.get('accept-language') || '').split(',')[0],
      40,
    );

    const smtpHost = process.env.SMTP_HOST || 'smtp.gmail.com';
    const smtpUser = process.env.SMTP_USER || '';
    const smtpPass = process.env.SMTP_PASS || '';
    const smtpPort = parseInt(process.env.SMTP_PORT || '465', 10);
    const mailTo = (process.env.MAIL_TO || '').trim();
    const mailFrom = process.env.MAIL_FROM || smtpUser || 'no-reply@example.com';
    const siteUrl = (process.env.SITE_URL || '').replace(/\/$/, '');

    // Dedup: if open lead exists for same phone, append note instead of new row
    let lead;
    let deduped = false;
    try {
      const openSame = await findOpenLeadsByPhone(phone);
      if (openSame.length > 0) {
        const existing = openSame[0];
        const noteLine = [
          `Повторна заявка ${formatKyivDateTime()}`,
          pagePath ? `сторінка ${pagePath}` : '',
          pageTitle ? `«${pageTitle}»` : '',
        ]
          .filter(Boolean)
          .join(' · ');
        const prevNote = (existing.note || '').trim();
        lead = await updateLead(existing.id, {
          note: prevNote ? `${prevNote}\n${noteLine}` : noteLine,
        });
        deduped = true;
      } else {
        lead = await appendLead({
          phone,
          emailed: false,
          source: resolveLeadSource(flow) === 'booking' || serviceId ? 'booking' : 'callback',
          zone,
          serviceId,
          serviceTitle,
          comment: comment || undefined,
          pagePath,
          utm,
        });
      }
    } catch (err) {
      console.error('[leads] failed to persist', err);
      lead = null;
    }

    // Write-first persistence requirement: refuse 200 without saved lead
    if (!lead) {
      return NextResponse.json({ error: 'Failed to save lead' }, { status: 500 });
    }

    let telegram = false;
    try {
      telegram = await autoNotifyNewLead(lead, { deduped });
    } catch {
      telegram = false;
    }

    const when = formatKyivDateTime();
    const pageUrl = absoluteSiteUrl(pagePath, siteUrl) || pagePath;
    const adminLeadsUrl = siteUrl ? `${siteUrl}/admin/leads` : undefined;
    const phoneDigits = phone.replace(/\D/g, '');
    const source = lead.source || resolveLeadSource(flow);

    const safePhone = escapeText(phone);
    const safeWhen = escapeText(when);
    const safeId = escapeText(lead.id);
    const safeSource = escapeText(source);
    const safePage = pageUrl ? escapeText(pageUrl) : '—';
    const safeTitle = pageTitle ? escapeText(pageTitle) : '—';
    const safeReferer = referer ? escapeText(referer) : '—';
    const safeIp = escapeText(ip);
    const safeUa = userAgent ? escapeText(userAgent) : '—';
    const safeLang = language ? escapeText(language) : '—';
    const safeAdmin = adminLeadsUrl ? escapeText(adminLeadsUrl) : undefined;

    let emailed = false;

    if (!smtpUser || !smtpPass || !mailTo) {
      console.warn('[CONTACT] Phone submission (no SMTP creds or MAIL_TO configured):', phone, {
        leadId: lead.id,
        pagePath,
        ip,
      });
    } else {
      try {
        const transporter = nodemailer.createTransport({
          host: smtpHost,
          port: smtpPort,
          secure: smtpPort === 465,
          auth: {
            user: smtpUser,
            pass: smtpPass,
          },
        });

        const html = `
          <p>Нова заявка з сайту B_You.</p>
          <p><strong>Телефон:</strong> <a href="tel:${escapeText(phoneDigits)}">${safePhone}</a></p>
          <p><strong>Час:</strong> ${safeWhen}</p>
          <p><strong>Джерело:</strong> ${safeSource}</p>
          ${serviceTitle ? `<p><strong>Послуга:</strong> ${escapeText(serviceTitle)}</p>` : ''}
          ${comment ? `<p><strong>Коментар:</strong> ${escapeText(comment)}</p>` : ''}
          <p><strong>Сторінка:</strong> <a href="${safePage}">${safePage}</a></p>
          ${pageTitle ? `<p><strong>Назва сторінки:</strong> ${safeTitle}</p>` : ''}
          ${safeAdmin ? `<p><strong>Адмінка:</strong> <a href="${safeAdmin}">Відкрити заявки</a> (ID: ${safeId})</p>` : ''}
          <p><strong>IP:</strong> ${safeIp}</p>
          <p><strong>Пристрій:</strong> ${safeUa}</p>
          <p><strong>Мова:</strong> ${safeLang}</p>
          ${referer ? `<p><strong>Перехід з:</strong> ${safeReferer}</p>` : ''}
          ${utmLine ? `<p><strong>UTM:</strong> ${escapeText(utmLine)}</p>` : ''}
        `;

        const textLines = [
          'Нова заявка з сайту B_You.',
          `Телефон: ${phone}`,
          `Час: ${when}`,
          `Джерело: ${source}`,
          serviceTitle ? `Послуга: ${serviceTitle}` : '',
          comment ? `Коментар: ${comment}` : '',
          `Сторінка: ${pageUrl}`,
          pageTitle ? `Назва: ${pageTitle}` : '',
          adminLeadsUrl ? `Адмінка: ${adminLeadsUrl} (ID: ${lead.id})` : '',
          `IP: ${ip}`,
          `Пристрій: ${userAgent || '—'}`,
          `Мова: ${language || '—'}`,
          referer ? `Перехід з: ${referer}` : '',
          utmLine ? `UTM: ${utmLine}` : '',
        ].filter(Boolean);

        await transporter.sendMail({
          from: `"B_You" <${mailFrom}>`,
          to: mailTo,
          subject: `Заявка з сайту · ${phone}`,
          html,
          text: textLines.join('\n'),
        });
        emailed = true;

        if (!deduped) {
          try {
            await updateLead(lead.id, { emailed: true });
          } catch (err) {
            console.error('[leads] failed to mark emailed', err);
          }
        }
      } catch (err) {
        console.error('Contact mail error:', err);
      }
    }

    return NextResponse.json({
      ok: true,
      emailed,
      telegram,
      deduped,
      leadId: lead.id,
      dev: !smtpUser || !smtpPass,
    });
  } catch (err) {
    console.error('Contact error:', err);
    return NextResponse.json({ error: 'Failed to send' }, { status: 500 });
  }
}
