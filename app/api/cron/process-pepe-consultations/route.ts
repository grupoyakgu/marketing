import { NextResponse } from 'next/server';
import { processPepeConsultations } from '@/lib/process-pepe-consultations';

export const dynamic = 'force-dynamic';
// Matches Pepe's own direct-message route (/api/telegram) — a consultation
// runs his same chat() loop, so it needs the same budget. A consultation
// left 'processing' if this invocation itself gets killed mid-task is a
// known, accepted edge case for now (rare — one user, one group chat)
// rather than something worth a full stuck-row recovery mechanism yet, same
// as process-santi-delegations.
export const maxDuration = 300;

export async function GET(req: Request) {
  if (
    process.env.CRON_SECRET &&
    req.headers.get('authorization') !== `Bearer ${process.env.CRON_SECRET}`
  ) {
    return new NextResponse('Unauthorized', { status: 401 });
  }

  const result = await processPepeConsultations();
  return NextResponse.json({ ok: true, ...result });
}
