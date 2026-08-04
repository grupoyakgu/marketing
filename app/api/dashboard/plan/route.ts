import { NextResponse } from 'next/server';
import { getWeeklyPlan } from '@/lib/marketing-plan';
import { getBestPostsInRange } from '@/lib/engagement';

export const dynamic = 'force-dynamic';

function addDays(dateStr: string, days: number): string {
  const d = new Date(dateStr + 'T00:00:00Z');
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().split('T')[0];
}

export async function GET(req: Request) {
  const weekStart = new URL(req.url).searchParams.get('week_start');
  if (!weekStart) {
    return NextResponse.json({ error: 'week_start is required (YYYY-MM-DD).' }, { status: 400 });
  }
  const [posts, weeklyLeaders] = await Promise.all([
    getWeeklyPlan(weekStart),
    // Best-effort — a crown badge is a nice-to-have, not worth failing the
    // whole plan load over if this query has a bad day.
    getBestPostsInRange(weekStart, addDays(weekStart, 6)).catch(() => ({})),
  ]);
  console.log(
    `[dashboard/plan GET] week_start=${weekStart} images=${JSON.stringify(
      posts.map(p => ({ id: p.id, image_url: p.image_url ?? null }))
    )}`
  );
  return NextResponse.json(
    { posts, weeklyLeaders },
    { headers: { 'Cache-Control': 'no-store, must-revalidate' } }
  );
}
