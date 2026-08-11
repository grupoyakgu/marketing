import { NextResponse } from 'next/server';
import { refreshAllPlatforms } from '@/lib/interactions';

export const dynamic = 'force-dynamic';

// Daily baseline top-up: queues one fetch request per platform per post
// missing from its daily target. The actual per-delete backfill is
// immediate (deletePost queues directly); this is the initial-bootstrap /
// general-safety-net pass, actually fulfilled by process-interaction-fetches
// (every 5 minutes) same as any other queued request.
export async function GET(req: Request) {
  if (
    process.env.CRON_SECRET &&
    req.headers.get('authorization') !== `Bearer ${process.env.CRON_SECRET}`
  ) {
    return new NextResponse('Unauthorized', { status: 401 });
  }

  const queued = await refreshAllPlatforms();
  return NextResponse.json({ ok: true, queued });
}
