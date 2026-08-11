import { NextResponse } from 'next/server';
import { processVideoJobs } from '@/lib/process-video-jobs';
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
  if (!(await isCronEnabled('process-video-jobs'))) {
    return NextResponse.json({ skipped: 'disabled' });
  }

  const result = await processVideoJobs();
  return NextResponse.json({ ok: true, ...result });
}
