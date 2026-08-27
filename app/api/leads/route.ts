import { NextRequest, NextResponse } from 'next/server';
import { toCsv } from '@/lib/csv';
import { deleteLead, listLeads, updateLead } from '@/lib/leads';
import { isWorkflowStatus } from '@/lib/workflow';
import { requireAdminRole } from '@/lib/require-role';

export const dynamic = 'force-dynamic';

async function guard() {
  return requireAdminRole('leads');
}

export async function GET(request: NextRequest) {
  const g = await guard();
  if (!g.ok) return g.response;

  const leads = await listLeads();
  const format = request.nextUrl.searchParams.get('format');
  if (format === 'csv') {
    const csv = toCsv(
      [
        'id',
        'createdAt',
        'phone',
        'pagePath',
        'utmSource',
        'utmMedium',
        'utmCampaign',
        'status',
        'handled',
        'note',
        'emailed',
        'callbackAt',
      ],
      leads.map((l) => [
        l.id,
        l.createdAt,
        l.phone,
        l.pagePath || '',
        l.utmSource || '',
        l.utmMedium || '',
        l.utmCampaign || '',
        l.status || '',
        l.handled,
        l.note || '',
        l.emailed,
        l.callbackAt || '',
      ]),
    );
    return new NextResponse(csv, {
      status: 200,
      headers: {
        'Content-Type': 'text/csv; charset=utf-8',
        'Content-Disposition': 'attachment; filename="leads.csv"',
      },
    });
  }
  return NextResponse.json({
    leads,
    total: leads.length,
    unhandled: leads.filter((l) => !l.handled).length,
  });
}

export async function PATCH(request: NextRequest) {
  const g = await guard();
  if (!g.ok) return g.response;

  try {
    const body = (await request.json()) as {
      id?: string;
      handled?: boolean;
      note?: string;
      status?: string;
      callbackAt?: string;
    };
    if (!body.id || typeof body.id !== 'string') {
      return NextResponse.json({ error: 'Missing id' }, { status: 400 });
    }
    if (body.status !== undefined && !isWorkflowStatus(body.status)) {
      return NextResponse.json({ error: 'Invalid status' }, { status: 400 });
    }
    const updated = await updateLead(body.id, {
      handled: body.handled,
      note: body.note,
      status: body.status as undefined | import('@/lib/workflow').WorkflowStatus,
      callbackAt: body.callbackAt,
    });
    if (!updated) {
      return NextResponse.json({ error: 'Not found' }, { status: 404 });
    }
    return NextResponse.json({ ok: true, lead: updated });
  } catch {
    return NextResponse.json({ error: 'Bad request' }, { status: 400 });
  }
}

export async function DELETE(request: NextRequest) {
  const g = await guard();
  if (!g.ok) return g.response;

  try {
    const body = (await request.json()) as { id?: string };
    if (!body.id || typeof body.id !== 'string') {
      return NextResponse.json({ error: 'Missing id' }, { status: 400 });
    }
    const ok = await deleteLead(body.id);
    if (!ok) {
      return NextResponse.json({ error: 'Not found' }, { status: 404 });
    }
    return NextResponse.json({ ok: true });
  } catch {
    return NextResponse.json({ error: 'Bad request' }, { status: 400 });
  }
}
