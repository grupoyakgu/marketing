import { NextRequest, NextResponse } from 'next/server';
import { listPosts, type InteractionPlatform } from '@/lib/interactions';

export const dynamic = 'force-dynamic';

function isPlatform(value: string | null): value is InteractionPlatform {
  return value === 'linkedin' || value === 'facebook' || value === 'instagram';
}

export async function GET(req: NextRequest) {
  const { searchParams } = req.nextUrl;
  const platformParam = searchParams.get('platform');
  const includeDone = searchParams.get('include_done') === 'true';

  try {
    const posts = await listPosts({
      platform: isPlatform(platformParam) ? platformParam : undefined,
      includeDone,
    });
    return NextResponse.json({ posts }, { headers: { 'Cache-Control': 'no-store, must-revalidate' } });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Failed to load interactions.' },
      { status: 500 }
    );
  }
}
