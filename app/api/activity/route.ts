import { NextRequest, NextResponse } from 'next/server';
import { getSession } from '@/lib/auth';
import { assertAdminIp } from '@/lib/require-admin-ip';
import { listActivity } from '@/lib/admin-activity';

export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest) {
  const ipGate = await assertAdminIp();
  if (!ipGate.ok) {
    return NextResponse.json({ error: ipGate.error }, { status: ipGate.status });
  }
  if (!(await getSession())) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
  const limit = Math.min(100, Math.max(1, Number(request.nextUrl.searchParams.get('limit') || 40) || 40));
  const entries = await listActivity(limit);
  return NextResponse.json({ entries });
}
