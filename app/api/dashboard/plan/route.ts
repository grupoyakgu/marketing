import { NextResponse } from 'next/server';
import { getWeeklyPlan } from '@/lib/marketing-plan';

export const dynamic = 'force-dynamic';

export async function GET(req: Request) {
  const weekStart = new URL(req.url).searchParams.get('week_start');
  if (!weekStart) {
    return NextResponse.json({ error: 'week_start is required (YYYY-MM-DD).' }, { status: 400 });
  }
  const posts = await getWeeklyPlan(weekStart);
  return NextResponse.json(
    { posts },
    { headers: { 'Cache-Control': 'no-store, must-revalidate' } }
  );
}
