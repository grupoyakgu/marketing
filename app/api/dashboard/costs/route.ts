import { NextResponse } from 'next/server';
import { getUsageSummary } from '@/lib/token-usage';

export const dynamic = 'force-dynamic';

const RANGE_DAYS: Record<string, number> = { '7d': 7, '30d': 30, '90d': 90 };

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const range = searchParams.get('range') ?? '30d';
  const days = RANGE_DAYS[range] ?? RANGE_DAYS['30d'];

  const since = new Date();
  since.setUTCDate(since.getUTCDate() - days);

  try {
    const summary = await getUsageSummary(since);
    return NextResponse.json(summary, { headers: { 'Cache-Control': 'no-store, must-revalidate' } });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Failed to load usage.' },
      { status: 500 }
    );
  }
}
