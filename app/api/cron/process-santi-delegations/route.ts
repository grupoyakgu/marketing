import { NextResponse } from 'next/server';
import { processSantiDelegations } from '@/lib/process-santi-delegations';

export const dynamic = 'force-dynamic';
// Matches Santi's own direct-message route (/api/telegram-santi) — a
// delegation runs his same full read/write/PR loop, so it needs the same
// budget. A delegation left 'processing' if this invocation itself gets
// killed mid-task is a known, accepted edge case for now (rare — one user,
// one group chat, unlikely to queue multiple large tasks within the same
// tick) rather than something worth a full stuck-row recovery mechanism yet.
export const maxDuration = 300;

export async function GET(req: Request) {
  if (
    process.env.CRON_SECRET &&
    req.headers.get('authorization') !== `Bearer ${process.env.CRON_SECRET}`
  ) {
    return new NextResponse('Unauthorized', { status: 401 });
  }

  const result = await processSantiDelegations();
  return NextResponse.json({ ok: true, ...result });
}
