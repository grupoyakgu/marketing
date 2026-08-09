import { NextResponse } from 'next/server';
import { processBotConsultations } from '@/lib/process-bot-consultations';

export const dynamic = 'force-dynamic';
// Matches every bot's own direct-message route — a consultation runs the
// target bot's same full chat() loop, so it needs the same budget. A
// consultation left 'processing' if this invocation itself gets killed
// mid-task is a known, accepted edge case for now (rare — one user, one
// group chat) rather than something worth a full stuck-row recovery
// mechanism yet.
export const maxDuration = 300;

export async function GET(req: Request) {
  if (
    process.env.CRON_SECRET &&
    req.headers.get('authorization') !== `Bearer ${process.env.CRON_SECRET}`
  ) {
    return new NextResponse('Unauthorized', { status: 401 });
  }

  const result = await processBotConsultations();
  return NextResponse.json({ ok: true, ...result });
}
