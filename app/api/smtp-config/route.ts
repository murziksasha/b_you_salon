import { NextResponse } from 'next/server';
import { z } from 'zod';
import { readMailConfig, writeMailEnv, type MailEnvPatch } from '@/lib/env-file';
import { requireAdminRole } from '@/lib/require-role';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

const PutSchema = z.object({
  host: z.string().max(253).optional(),
  port: z.union([z.string().max(8), z.number()]),
  user: z.string().max(320).optional(),
  from: z.string().max(320).optional(),
  to: z.string().max(320),
  password: z.string().max(512).optional(),
  clearPassword: z.boolean().optional(),
});

function parsePort(value: string | number): number | null {
  if (typeof value === 'number') {
    if (!Number.isInteger(value) || value < 1 || value > 65535) return null;
    return value;
  }
  const trimmed = value.trim();
  if (!/^\d+$/.test(trimmed)) return null;
  const port = Number(trimmed);
  if (port < 1 || port > 65535) return null;
  return port;
}

export async function GET() {
  const gate = await requireAdminRole('security_owner');
  if (!gate.ok) return gate.response;

  try {
    const config = await readMailConfig();
    return NextResponse.json(config);
  } catch (err) {
    console.error('[smtp-config] read failed', err instanceof Error ? err.message : 'error');
    return NextResponse.json({ error: 'Не вдалося прочитати .env' }, { status: 500 });
  }
}

export async function PUT(request: Request) {
  const gate = await requireAdminRole('security_owner');
  if (!gate.ok) return gate.response;

  const raw = await request.json().catch(() => undefined);
  const parsed = PutSchema.safeParse(raw);
  if (!parsed.success) {
    return NextResponse.json({ error: 'Перевірте порт і одержувача' }, { status: 400 });
  }

  const body = parsed.data;
  const port = parsePort(body.port);
  if (port === null) {
    return NextResponse.json({ error: 'Порт має бути від 1 до 65535' }, { status: 400 });
  }

  const to = body.to.trim();
  if (!to) {
    return NextResponse.json({ error: 'Вкажіть одержувача (MAIL_TO)' }, { status: 400 });
  }

  const host = (body.host ?? '').trim();
  const user = (body.user ?? '').trim();
  const from = (body.from ?? '').trim();
  const password = body.password ?? '';
  if ([host, user, from, to, password].some((value) => /[\r\n]/.test(value))) {
    return NextResponse.json({ error: 'Значення не може містити перенос рядка' }, { status: 400 });
  }

  const patch: MailEnvPatch = {
    SMTP_HOST: host,
    SMTP_PORT: String(port),
    SMTP_USER: user,
    MAIL_FROM: from,
    MAIL_TO: to,
  };
  if (body.clearPassword) patch.SMTP_PASS = '';
  else if (password !== '') patch.SMTP_PASS = password;

  try {
    const config = await writeMailEnv(patch);
    return NextResponse.json({ ok: true, ...config });
  } catch (err) {
    console.error('[smtp-config] write failed', err instanceof Error ? err.message : 'error');
    return NextResponse.json({ error: 'Не вдалося записати .env' }, { status: 500 });
  }
}
