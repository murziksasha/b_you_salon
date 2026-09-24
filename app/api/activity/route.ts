import { NextRequest, NextResponse } from 'next/server';
import { listActivity } from '@/lib/admin-activity';
import { requireAdminRole } from '@/lib/require-role';

export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest) {
  const g = await requireAdminRole('activity');
  if (!g.ok) return g.response;
  const limit = Math.min(100, Math.max(1, Number(request.nextUrl.searchParams.get('limit') || 40) || 40));
  const entries = await listActivity(limit);
  return NextResponse.json({ entries });
}
