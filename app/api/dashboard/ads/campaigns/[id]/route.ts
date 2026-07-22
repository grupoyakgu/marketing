import { NextResponse } from 'next/server';
import { getCampaignDetail, type AdPlatform } from '@/lib/meta-ads';

export const dynamic = 'force-dynamic';

function defaultRange(): { since: string; until: string } {
  const until = new Date();
  const since = new Date();
  since.setDate(since.getDate() - 30);
  return { since: since.toISOString().split('T')[0], until: until.toISOString().split('T')[0] };
}

export async function GET(req: Request, { params }: { params: { id: string } }) {
  const url = new URL(req.url);
  const platformParam = url.searchParams.get('platform');
  const platform: AdPlatform | undefined =
    platformParam === 'facebook' || platformParam === 'instagram' ? platformParam : undefined;
  const fallback = defaultRange();
  const since = url.searchParams.get('since') ?? fallback.since;
  const until = url.searchParams.get('until') ?? fallback.until;

  try {
    const detail = await getCampaignDetail(params.id, { platform, since, until });
    if (!detail) return NextResponse.json({ error: 'Campaign not found or Meta Ads not configured.' }, { status: 404 });
    return NextResponse.json(
      { campaign: detail },
      { headers: { 'Cache-Control': 'no-store, must-revalidate' } }
    );
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Failed to load campaign.' },
      { status: 502 }
    );
  }
}
