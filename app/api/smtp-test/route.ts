import { NextResponse } from 'next/server';
import nodemailer from 'nodemailer';
import { requireAdminRole } from '@/lib/require-role';

export const dynamic = 'force-dynamic';

/** Admin-only: send a test email to MAIL_TO. */
export async function POST() {
  const gate = await requireAdminRole('settings');
  if (!gate.ok) return gate.response;

  const smtpHost = process.env.SMTP_HOST || 'smtp.gmail.com';
  const smtpUser = process.env.SMTP_USER || '';
  const smtpPass = process.env.SMTP_PASS || '';
  const smtpPort = parseInt(process.env.SMTP_PORT || '465', 10);
  const mailTo = process.env.MAIL_TO || '';
  const mailFrom = process.env.MAIL_FROM || smtpUser || 'no-reply@example.com';

  if (!smtpUser || !smtpPass) {
    return NextResponse.json({ error: 'SMTP_USER / SMTP_PASS не налаштовано' }, { status: 400 });
  }
  if (!mailTo) {
    return NextResponse.json({ error: 'MAIL_TO не налаштовано' }, { status: 400 });
  }

  try {
    const transporter = nodemailer.createTransport({
      host: smtpHost,
      port: smtpPort,
      secure: smtpPort === 465,
      auth: { user: smtpUser, pass: smtpPass },
    });

    await transporter.sendMail({
      from: `"B_You" <${mailFrom}>`,
      to: mailTo,
      subject: 'Тест SMTP · B_You',
      text: `Тестовий лист ${new Date().toLocaleString('uk-UA')}\nHOST=${smtpHost}:${smtpPort}`,
      html: `<p>Тестовий лист <strong>B_You</strong></p><p>${new Date().toLocaleString('uk-UA')}</p>`,
    });

    return NextResponse.json({ ok: true, to: mailTo });
  } catch (err) {
    console.error('[smtp-test]', err);
    return NextResponse.json({ error: err instanceof Error ? err.message : 'SMTP send failed' }, { status: 500 });
  }
}
