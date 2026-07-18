import { NextResponse } from 'next/server';
import {
  getPostCounts,
  getPostsPublishedByDate,
  getPostedPostsForCommentCheck,
} from '@/lib/marketing-plan';
import {
  getAllAccountStats,
  getAccountGrowth,
  getFollowerHistory,
  getFacebookPostEngagement,
  getInstagramPostEngagement,
  getLinkedInPostEngagement,
  type PostEngagement,
} from '@/lib/engagement';

export const dynamic = 'force-dynamic';

export async function GET() {
  const [postCounts, postsByDate, accountStats, followerHistory, recentPosts] = await Promise.all([
    getPostCounts(),
    getPostsPublishedByDate(14),
    getAllAccountStats(),
    getFollowerHistory(30),
    getPostedPostsForCommentCheck(),
  ]);

  const growth = await getAccountGrowth(accountStats);

  const engagements: PostEngagement[] = [];
  for (const row of recentPosts) {
    try {
      let eng: PostEngagement | null = null;
      if (row.platform === 'facebook') eng = await getFacebookPostEngagement(row.platform_post_id);
      else if (row.platform === 'instagram') eng = await getInstagramPostEngagement(row.platform_post_id);
      else if (row.platform === 'linkedin') eng = await getLinkedInPostEngagement(row.platform_post_id);
      if (eng) engagements.push(eng);
    } catch {}
  }

  const totals = engagements.reduce(
    (acc, e) => ({
      likes: acc.likes + e.likes,
      comments: acc.comments + e.comments,
      shares: acc.shares + e.shares,
      impressions: acc.impressions + e.impressions,
      reach: acc.reach + e.reach,
    }),
    { likes: 0, comments: 0, shares: 0, impressions: 0, reach: 0 }
  );

  const totalEngagement = totals.likes + totals.comments + totals.shares;
  const totalFollowers = accountStats.reduce((sum, s) => sum + s.followers, 0);

  return NextResponse.json({
    postCounts,
    postsByDate,
    accountStats,
    growth,
    followerHistory,
    engagement: { ...totals, total: totalEngagement, postsTracked: engagements.length },
    totalFollowers,
  });
}
