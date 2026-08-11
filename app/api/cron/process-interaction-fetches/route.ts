import { NextResponse } from 'next/server';
import { processInteractionFetches } from '@/lib/process-interaction-fetches';

export const dynamic = 'force-dynamic';
// Matches process-santi-delegations: a fetch runs Pepe's full chat() loop,
// including a browse_social_search call, so it needs the same budget.
export const maxDuration = 300;

export async function GET(req: Request) {
  if (
    process.env.CRON_SECRET &&
    req.headers.get('authorization') !== `Bearer ${process.env.CRON_SECRET}`
  ) {
    return new NextResponse('Unauthorized', { status: 401 });
  }

  const result = await processInteractionFetches();
  return NextResponse.json({ ok: true, ...result });
}
