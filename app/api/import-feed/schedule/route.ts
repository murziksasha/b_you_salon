import { NextRequest, NextResponse } from 'next/server';
import { requireAdminRole } from '@/lib/require-role';
import {
  readFeedSchedule,
  saveFeedSchedule,
  applyContinue,
  applyStop,
  nextRunLabel,
} from '@/lib/feed-schedule';
import { abortScheduledRun } from '@/lib/feed-schedule-runner';

export async function GET() {
  const g = await requireAdminRole('editor');
  if (!g.ok) return g.response;

  const sched = await readFeedSchedule();
  const nextRun = nextRunLabel(sched, new Date());
  return NextResponse.json({ ...sched, nextRun });
}

export async function PUT(request: NextRequest) {
  const g = await requireAdminRole('editor');
  if (!g.ok) return g.response;

  let body: { enabled?: boolean; url?: string };
  try {
    body = (await request.json()) as { enabled?: boolean; url?: string };
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
  }

  let sched = await readFeedSchedule();

  if (typeof body.url === 'string') {
    const url = body.url.trim();
    if (url && (!/^https?:\/\//i.test(url) || url.length > 600)) {
      return NextResponse.json({ error: 'url must be a valid http(s) URL (max 600 chars)' }, { status: 400 });
    }
    sched = { ...sched, url: url || sched.url };
  }

  if (typeof body.enabled === 'boolean') {
    if (body.enabled) {
      sched = applyContinue(sched, new Date());
    } else {
      sched = applyStop(sched);
      abortScheduledRun();
    }
  }

  await saveFeedSchedule(sched);
  const nextRun = nextRunLabel(sched, new Date());
  return NextResponse.json({ ...sched, nextRun });
}
