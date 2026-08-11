import { NextResponse } from 'next/server';
import { getDailyCounts, setDailyCount, listTopics, type InteractionPlatform } from '@/lib/interactions';

export const dynamic = 'force-dynamic';

function isPlatform(value: unknown): value is InteractionPlatform {
  return value === 'linkedin' || value === 'facebook' || value === 'instagram';
}

export async function GET() {
  try {
    const [dailyCounts, topics] = await Promise.all([getDailyCounts(), listTopics()]);
    return NextResponse.json(
      { dailyCounts, topics },
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
  if (!isPlatform(body.platform)) {
    return NextResponse.json({ error: 'platform must be one of linkedin, facebook, instagram.' }, { status: 400 });
  }
  if (!Number.isInteger(count) || count < 1 || count > 10) {
    return NextResponse.json({ error: 'dailyCount must be an integer between 1 and 10.' }, { status: 400 });
  }
  try {
    const dailyCount = await setDailyCount(body.platform, count);
    return NextResponse.json({ platform: body.platform, dailyCount });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Failed to update settings.' },
      { status: 400 }
    );
  }
}
