import { NextResponse } from 'next/server';
import { processBotFollowups } from '@/lib/process-bot-followups';

export const dynamic = 'force-dynamic';
// Matches every bot's own direct-message route — a followup runs the
// target bot's same full chat() loop, so it needs the same budget.
export const maxDuration = 300;

export async function GET(req: Request) {
  if (
    process.env.CRON_SECRET &&
    req.headers.get('authorization') !== `Bearer ${process.env.CRON_SECRET}`
  ) {
    return new NextResponse('Unauthorized', { status: 401 });
  }

  const result = await processBotFollowups();
  return NextResponse.json({ ok: true, ...result });
}
