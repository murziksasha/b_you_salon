import { NextResponse } from 'next/server';
import { getSession } from '@/lib/auth';
import { assertAdminIp } from '@/lib/require-admin-ip';
import { listLeads } from '@/lib/leads';
import { listOrders } from '@/lib/orders';
import { getSiteData } from '@/lib/site-data';
import {
  countByDay,
  mergeInbox,
  topOrderedProducts,
  topPagePaths,
  topUtmSources,
  upcomingCallbacks,
} from '@/lib/inbox';
import { listActivity } from '@/lib/admin-activity';
import { computeProcessMetrics, formatDurationSec } from '@/lib/process-metrics';
import { scanCatalog } from '@/lib/catalog-health';

export const dynamic = 'force-dynamic';

export async function GET() {
  const ipGate = await assertAdminIp();
  if (!ipGate.ok) {
    return NextResponse.json({ error: ipGate.error }, { status: ipGate.status });
  }
  if (!(await getSession())) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const [leads, orders, site, activity] = await Promise.all([
    listLeads(),
    listOrders(),
    getSiteData(),
    listActivity(25),
  ]);
  const inbox = mergeInbox(leads, orders);
  const open = inbox.filter((i) => i.open);
  const veryStale = open.filter((i) => i.veryStale);

  const callbacks = upcomingCallbacks(inbox, 15);
  const process = computeProcessMetrics(leads, orders);
  const catalog = scanCatalog(site.goods || []);
  const scheduled = (site.pages || [])
    .filter((p) => p.publishAt)
    .map((p) => ({
      id: p.id,
      title: p.title,
      slug: p.slug,
      publishAt: p.publishAt,
      hasDraft: Boolean(p.draft),
      visible: p.visible,
    }))
    .sort((a, b) => Date.parse(a.publishAt || '') - Date.parse(b.publishAt || ''));

  return NextResponse.json({
    openLeads: open.filter((i) => i.kind === 'lead').length,
    openOrders: open.filter((i) => i.kind === 'order').length,
    openTotal: open.length,
    veryStale: veryStale.length,
    queue: open.slice(0, 12),
    callbacks,
    byDay: countByDay(leads, orders, 30),
    topPages: topPagePaths(leads, 8),
    topUtm: topUtmSources(leads, 8),
    topProducts: topOrderedProducts(orders, 8),
    goodsVisible: site.goods.filter((g) => g.visible).length,
    goodsTotal: site.goods.length,
    pagesVisible: site.pages.filter((p) => p.visible).length,
    activity,
    process: {
      ...process,
      medianTimeToFirstTouchLabel: formatDurationSec(process.medianTimeToFirstTouchSec),
      avgTimeToFirstTouchLabel: formatDurationSec(process.avgTimeToFirstTouchSec),
    },
    catalog: {
      issueCount: catalog.issues.length,
      issues: catalog.issues.slice(0, 15),
      visibleWithoutPhoto: catalog.visibleWithoutPhoto,
      hidden: catalog.hidden,
    },
    scheduled,
  });
}
