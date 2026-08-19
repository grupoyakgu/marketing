import { NextResponse } from 'next/server';
import { processEmailLeads } from '@/lib/process-email-leads';
import { isCronEnabled } from '@/lib/cron-settings';

export const dynamic = 'force-dynamic';
export const maxDuration = 120;

export async function GET(req: Request) {
  if (
    process.env.CRON_SECRET &&
    req.headers.get('authorization') !== `Bearer ${process.env.CRON_SECRET}`
  ) {
    return new NextResponse('Unauthorized', { status: 401 });
  }
  if (!(await isCronEnabled('process-email-leads'))) {
    return NextResponse.json({ skipped: 'disabled' });
  }

  const result = await processEmailLeads();
  return NextResponse.json({ ok: true, ...result });
}
