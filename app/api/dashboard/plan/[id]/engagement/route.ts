import { NextResponse } from 'next/server';
import { getPostById } from '@/lib/marketing-plan';
import {
  getCachedPostEngagements,
  getFacebookPostEngagement,
  getInstagramPostEngagement,
  getLinkedInPostEngagement,
  upsertPostEngagementCache,
  computeEngagementRate,
  type PostEngagement,
} from '@/lib/engagement';

export const dynamic = 'force-dynamic';

// Cache-first (matches how the rest of the dashboard reads engagement — see
// the comment on loadOverview in app/(dashboard)/page.tsx) with a live-fetch
// fallback for a post published since the last daily refresh, so clicking a
// just-published post doesn't show nothing until tomorrow's cron runs.
export async function GET(_req: Request, { params }: { params: { id: string } }) {
  const post = await getPostById(params.id);
  if (!post) {
    return NextResponse.json({ error: 'Post not found.' }, { status: 404 });
  }
  if (post.status !== 'posted' || !post.platform_post_id) {
    return NextResponse.json({ error: 'This post has not been published yet.' }, { status: 400 });
  }

  const [cached] = await getCachedPostEngagements([{ platform: post.platform, platform_post_id: post.platform_post_id }]);
  if (cached) {
    return NextResponse.json({ engagement: { ...cached, engagementRate: computeEngagementRate(cached) } });
  }

  let live: PostEngagement | null = null;
  try {
    if (post.platform === 'facebook') live = await getFacebookPostEngagement(post.platform_post_id);
    else if (post.platform === 'instagram') live = await getInstagramPostEngagement(post.platform_post_id);
    else live = await getLinkedInPostEngagement(post.platform_post_id);
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : 'Failed to load engagement.' }, { status: 502 });
  }
  if (!live) {
    return NextResponse.json({ error: 'No engagement data available yet.' }, { status: 502 });
  }

  upsertPostEngagementCache([live]).catch(() => {});
  return NextResponse.json({ engagement: { ...live, engagementRate: computeEngagementRate(live) } });
}
