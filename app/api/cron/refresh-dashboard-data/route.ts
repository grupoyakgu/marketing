import { NextResponse } from 'next/server';
import { refreshDashboardData } from '@/lib/dashboard-refresh';
import { isCronEnabled } from '@/lib/cron-settings';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

export async function GET(req: Request) {
  if (
    process.env.CRON_SECRET &&
    req.headers.get('authorization') !== `Bearer ${process.env.CRON_SECRET}`
  ) {
    return new NextResponse('Unauthorized', { status: 401 });
  }
  if (!(await isCronEnabled('refresh-dashboard-data'))) {
    return NextResponse.json({ skipped: 'disabled' });
  }

  const result = await refreshDashboardData();
  return NextResponse.json({ ok: true, ...result });
}
