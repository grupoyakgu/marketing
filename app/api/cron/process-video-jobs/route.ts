import { NextResponse } from 'next/server';
import { processVideoJobs } from '@/lib/process-video-jobs';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

export async function GET(req: Request) {
  if (
    process.env.CRON_SECRET &&
    req.headers.get('authorization') !== `Bearer ${process.env.CRON_SECRET}`
  ) {
    return new NextResponse('Unauthorized', { status: 401 });
  }

  const result = await processVideoJobs();
  return NextResponse.json({ ok: true, ...result });
}
