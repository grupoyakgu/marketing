import { NextResponse } from 'next/server';
import { getAccountDailySeries, isMetaAdsConfigured, type AdPlatform } from '@/lib/meta-ads';

export const dynamic = 'force-dynamic';

function defaultRange(): { since: string; until: string } {
  const until = new Date();
  const since = new Date();
  since.setDate(since.getDate() - 30);
  return { since: since.toISOString().split('T')[0], until: until.toISOString().split('T')[0] };
}

export async function GET(req: Request) {
  if (!isMetaAdsConfigured()) {
    return NextResponse.json({ configured: false, series: [] });
  }

  const url = new URL(req.url);
  const platformParam = url.searchParams.get('platform');
  const platform: AdPlatform | undefined =
    platformParam === 'facebook' || platformParam === 'instagram' ? platformParam : undefined;
  const accountId = url.searchParams.get('account') ?? undefined;
  const fallback = defaultRange();
  const since = url.searchParams.get('since') ?? fallback.since;
  const until = url.searchParams.get('until') ?? fallback.until;

  try {
    const series = await getAccountDailySeries(since, until, { platform, accountId });
    return NextResponse.json(
      { configured: true, series },
      { headers: { 'Cache-Control': 'no-store, must-revalidate' } }
    );
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Failed to load ads daily series.' },
      { status: 502 }
    );
  }
}
