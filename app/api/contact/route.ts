import { NextRequest, NextResponse } from 'next/server';
import nodemailer from 'nodemailer';
import { appendLead, findOpenLeadsByPhone, updateLead } from '@/lib/leads';
import { getSiteData } from '@/lib/site-data';
import { zoneFromPath } from '@/lib/zone';
import {
  absoluteSiteUrl,
  sanitizePagePath,
  sanitizePageTitle,
  truncateMeta,
} from '@/lib/page-path';
import { notifyLead } from '@/lib/notify';
import { clientKey, rateLimit } from '@/lib/rate-limit';
import { escapeText } from '@/lib/sanitize';
import { isValidUaPhone, normalizePhoneCanonical } from '@/lib/phone';
import { formatUtmLine, mergeUtm, parseUtmFromBody, parseUtmFromPagePath } from '@/lib/utm';

function clientIp(request: NextRequest): string {
  const forwarded = request.headers.get('x-forwarded-for');
  return forwarded?.split(',')[0]?.trim() || request.headers.get('x-real-ip') || 'unknown';
}

export async function POST(request: NextRequest) {
  const rl = rateLimit(clientKey(request, 'contact'), { limit: 8, windowMs: 60_000 });
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

    const contentType = request.headers.get('content-type') || '';
    if (contentType.includes('application/json')) {
      const body = await request.json();
      phone = typeof body.phone === 'string' ? body.phone : '';
      pagePathRaw = body.pagePath;
      pageTitleRaw = body.pageTitle;
      honeypot = typeof body.website === 'string' ? body.website : '';
      serviceIdRaw = typeof body.serviceId === 'string' ? body.serviceId : '';
      commentRaw = typeof body.comment === 'string' ? body.comment : '';
      bodyUtm = parseUtmFromBody(body as Record<string, unknown>);
    } else {
      const formData = await request.formData();
      phone = String(formData.get('phone') || '');
      pagePathRaw = formData.get('pagePath');
      pageTitleRaw = formData.get('pageTitle');
      honeypot = String(formData.get('website') || '');
      serviceIdRaw = String(formData.get('serviceId') || '');
      commentRaw = String(formData.get('comment') || '');
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

    const pagePath = sanitizePagePath(pagePathRaw);
    const pageTitle = sanitizePageTitle(pageTitleRaw);
    const zone = zoneFromPath(pagePath || '/');
    const comment = commentRaw.trim().slice(0, 1000);
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
    const mailTo = process.env.MAIL_TO || 'remontmailshop@gmail.com';
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
          `Повторна заявка ${new Date().toLocaleString('uk-UA')}`,
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
          source: zone === 'salon' || serviceId ? 'booking' : 'callback',
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

    // Fire-and-await Telegram (non-blocking for failure)
    let telegram = false;
    try {
      telegram = await notifyLead({
        phone,
        leadId: lead?.id,
        pagePath,
        utmLine,
        zone,
        serviceTitle,
        comment,
      });
      if (lead && telegram) {
        // re-read not needed; flag only for response/logging
      }
    } catch {
      telegram = false;
    }

    const when = new Date().toLocaleString('uk-UA');
    const pageUrl = absoluteSiteUrl(pagePath, siteUrl) || pagePath;
    const adminLeadsUrl = siteUrl ? `${siteUrl}/admin/leads` : undefined;
    const phoneDigits = phone.replace(/\D/g, '');
    const source = 'callback';

    const safePhone = escapeText(phone);
    const safeWhen = escapeText(when);
    const safeId = lead ? escapeText(lead.id) : '—';
    const safeSource = escapeText(source);
    const safePage = pageUrl ? escapeText(pageUrl) : '—';
    const safeTitle = pageTitle ? escapeText(pageTitle) : '—';
    const safeReferer = referer ? escapeText(referer) : '—';
    const safeIp = escapeText(ip);
    const safeUa = userAgent ? escapeText(userAgent) : '—';
    const safeLang = language ? escapeText(language) : '—';
    const safeAdmin = adminLeadsUrl ? escapeText(adminLeadsUrl) : undefined;

    let emailed = false;

    if (!smtpUser || !smtpPass) {
      console.log('[CONTACT] Phone submission (no SMTP creds configured):', phone, {
        leadId: lead?.id,
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
        <p>Клієнт залишив <strong>заявку на дзвінок</strong>${
          deduped ? ' <em>(повтор · оновлено існуючу)</em>' : ''
        }.</p>
        <p><strong>Телефон:</strong> <a href="tel:${escapeText(phoneDigits)}">${safePhone}</a></p>
        <p><strong>Час:</strong> ${safeWhen}</p>
        <p><strong>ID заявки:</strong> ${safeId}</p>
        <p><strong>Джерело:</strong> ${safeSource}</p>
        <p><strong>Сторінка:</strong> ${
          pageUrl ? `<a href="${safePage}">${safePage}</a>` : '—'
        }</p>
        <p><strong>Заголовок сторінки:</strong> ${safeTitle}</p>
        <p><strong>Зона:</strong> ${escapeText(zone)}</p>
        <p><strong>Послуга:</strong> ${serviceTitle ? escapeText(serviceTitle) : '—'}</p>
        <p><strong>Коментар:</strong> ${comment ? escapeText(comment) : '—'}</p>
        <p><strong>Referer:</strong> ${safeReferer}</p>
        <p><strong>IP:</strong> ${safeIp}</p>
        <p><strong>User-Agent:</strong> ${safeUa}</p>
        <p><strong>Мова браузера:</strong> ${safeLang}</p>
        <p><strong>UTM:</strong> ${escapeText(utmLine)}</p>
        ${
          safeAdmin
            ? `<p><strong>Журнал:</strong> <a href="${safeAdmin}">${safeAdmin}</a></p>`
            : ''
        }
      `;

        const textLines = [
          'Клієнт залишив заявку на дзвінок.',
          `Телефон: ${phone}`,
          `Час: ${when}`,
          `ID заявки: ${lead?.id || '—'}`,
          `Джерело: ${source}`,
          `Сторінка: ${pageUrl || '—'}`,
          `Заголовок сторінки: ${pageTitle || '—'}`,
          `Referer: ${referer || '—'}`,
          `IP: ${ip}`,
          `User-Agent: ${userAgent || '—'}`,
          `Мова браузера: ${language || '—'}`,
          `UTM: ${utmLine}`,
        ];
        if (adminLeadsUrl) textLines.push(`Журнал: ${adminLeadsUrl}`);

        await transporter.sendMail({
          from: `"B_You" <${mailFrom}>`,
          to: mailTo,
          subject: `${deduped ? 'Повторний' : 'Новий'} дзвінок з сайту · ${phone}`,
          html,
          text: textLines.join('\n'),
        });
        emailed = true;

        if (lead && !deduped) {
          try {
            await updateLead(lead.id, { emailed: true });
          } catch (err) {
            console.error('[leads] failed to mark emailed', err);
          }
        }
      } catch (err) {
        console.error('Contact mail error:', err);
        // Lead already in journal with emailed: false
      }
    }

    // Completely lost the request (no journal, no mail)
    if (!lead && !emailed) {
      return NextResponse.json({ error: 'Failed to save lead' }, { status: 500 });
    }

    return NextResponse.json({
      ok: true,
      emailed,
      telegram,
      deduped,
      leadId: lead?.id,
      dev: !smtpUser || !smtpPass,
    });
  } catch (err) {
    console.error('Contact error:', err);
    return NextResponse.json({ error: 'Failed to send' }, { status: 500 });
  }
}
