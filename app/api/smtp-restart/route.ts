import { after, NextResponse } from 'next/server';
import { requireAdminRole } from '@/lib/require-role';
import { checkByouProject, startProjectPm2Restart } from '@/lib/smtp-restart';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

export async function POST() {
  const gate = await requireAdminRole('security_owner');
  if (!gate.ok) return gate.response;

  const check = await checkByouProject();
  if (!check.ok) {
    return NextResponse.json({ error: check.error }, { status: check.status });
  }

  after(() => {
    try {
      startProjectPm2Restart(check.root);
    } catch (err) {
      console.error('[smtp-restart] failed to spawn pm2', err instanceof Error ? err.message : 'error');
    }
  });

  return NextResponse.json({
    ok: true,
    message: 'Перезапуск почався. Сайт на кілька секунд буде недоступний.',
  });
}
