import { NextResponse } from 'next/server';
import { getAdsDashboard, isMetaAdsConfigured, type AdPlatform } from '@/lib/meta-ads';

export const dynamic = 'force-dynamic';

function defaultRange(): { since: string; until: string } {
  const until = new Date();
  const since = new Date();
  since.setDate(since.getDate() - 30);
  return { since: since.toISOString().split('T')[0], until: until.toISOString().split('T')[0] };
}

export async function GET(req: Request) {
  if (!isMetaAdsConfigured()) {
    return NextResponse.json({ configured: false, currency: 'USD', campaigns: [] });
  }

  const url = new URL(req.url);
  const platformParam = url.searchParams.get('platform');
  const platform: AdPlatform | undefined =
    platformParam === 'facebook' || platformParam === 'instagram' ? platformParam : undefined;
  const fallback = defaultRange();
  const since = url.searchParams.get('since') ?? fallback.since;
  const until = url.searchParams.get('until') ?? fallback.until;

  try {
    const dashboard = await getAdsDashboard({ platform, since, until });
    if (!dashboard) return NextResponse.json({ configured: false, currency: 'USD', campaigns: [] });
    return NextResponse.json(
      { configured: true, ...dashboard },
      { headers: { 'Cache-Control': 'no-store, must-revalidate' } }
    );
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Failed to load ads dashboard.' },
      { status: 502 }
    );
  }
}
