import { NextResponse } from 'next/server';
import { processAngelesFollowups } from '@/lib/process-angeles-followups';

export const dynamic = 'force-dynamic';
// Matches Angeles's own direct-message route (/api/telegram-angeles) — a
// followup runs her same chat() loop, so it needs the same budget. A
// followup left 'processing' if this invocation itself gets killed
// mid-task is a known, accepted edge case for now (rare — one user, one
// group chat) rather than something worth a full stuck-row recovery
// mechanism yet, same as process-santi-delegations / process-pepe-consultations.
export const maxDuration = 300;

export async function GET(req: Request) {
  if (
    process.env.CRON_SECRET &&
    req.headers.get('authorization') !== `Bearer ${process.env.CRON_SECRET}`
  ) {
    return new NextResponse('Unauthorized', { status: 401 });
  }

  const result = await processAngelesFollowups();
  return NextResponse.json({ ok: true, ...result });
}
