import { NextResponse } from 'next/server';
import { getDailyCount, setDailyCount, listTopics } from '@/lib/interactions';

export const dynamic = 'force-dynamic';

export async function GET() {
  try {
    const [dailyCount, topics] = await Promise.all([getDailyCount(), listTopics()]);
    return NextResponse.json(
      { dailyCount, topics },
      { headers: { 'Cache-Control': 'no-store, must-revalidate' } }
    );
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Failed to load settings.' },
      { status: 500 }
    );
  }
}

export async function PATCH(req: Request) {
  const body = await req.json().catch(() => ({}));
  const count = Number(body.dailyCount);
  if (!Number.isInteger(count) || count < 1 || count > 20) {
    return NextResponse.json({ error: 'dailyCount must be an integer between 1 and 20.' }, { status: 400 });
  }
  try {
    const dailyCount = await setDailyCount(count);
    return NextResponse.json({ dailyCount });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Failed to update settings.' },
      { status: 400 }
    );
  }
}
