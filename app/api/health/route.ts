import { NextResponse } from 'next/server';
import { getSession } from '@/lib/auth';
import { getHealthReport, getPublicHealth } from '@/lib/health';

export const dynamic = 'force-dynamic';

/**
 * Health probe for Docker / Keen DNS / admin dashboard.
 * Public: minimal ok/uptime. Authenticated session: full ops report.
 */
export async function GET() {
  const authed = await getSession().catch(() => false);

  if (authed) {
    const report = await getHealthReport();
    return NextResponse.json(report, {
      status: report.ok ? 200 : 503,
      headers: { 'Cache-Control': 'no-store' },
    });
  }

  const publicReport = await getPublicHealth();
  return NextResponse.json(publicReport, {
    status: publicReport.ok ? 200 : 503,
    headers: { 'Cache-Control': 'no-store' },
  });
}
