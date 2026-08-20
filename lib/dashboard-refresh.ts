import { revalidatePath } from 'next/cache';
import {
  getAllAccountStats,
  recordAccountStatsSnapshot,
  upsertPostEngagementCache,
  upsertPaidPostStatsCache,
  recordRefreshStatus,
  getFacebookPostEngagement,
  getInstagramPostEngagement,
  getLinkedInPostEngagement,
  getPostsForPerformanceRefresh,
  type PostEngagement,
} from '@/lib/engagement';
import { getPostedPostsForCommentCheck } from '@/lib/marketing-plan';
import { getPaidStatsByPostUrl, isMetaAdsConfigured } from '@/lib/meta-ads';

export interface DashboardRefreshResult {
  durationMs: number;
  accountsRefreshed: number;
  postsRefreshed: number;
}

/** Does the slow, live external-API work (Facebook/Instagram/LinkedIn) and writes
 * the results to the cache tables the dashboard reads from. Shared by the daily
 * cron and the manual "Refresh now" action — same work, two triggers. */
export async function refreshDashboardData(): Promise<DashboardRefreshResult> {
  const start = Date.now();

  const [accountStats, recentPosts, performancePosts, paidStats] = await Promise.all([
    getAllAccountStats(),
    getPostedPostsForCommentCheck(),
    getPostsForPerformanceRefresh(),
    isMetaAdsConfigured() ? getPaidStatsByPostUrl() : Promise.resolve(new Map()),
  ]);
  // Two different windows with two different purposes, unioned and deduped:
  // getPostedPostsForCommentCheck's 7-30 day window is for comment-reply
  // relevance, while the Performance leaderboard needs every published post
  // (up to its own cap) kept fresh daily — a post outside the comment window
  // would otherwise never get refreshed again once it aged out.
  const seen = new Set<string>();
  const postsToRefresh = [...recentPosts, ...performancePosts].filter(row => {
    const key = `${row.platform}:${row.platform_post_id}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });

  const engagementResults = await Promise.allSettled(
    postsToRefresh.map(row => {
      if (row.platform === 'facebook') return getFacebookPostEngagement(row.platform_post_id);
      if (row.platform === 'instagram') return getInstagramPostEngagement(row.platform_post_id);
      return getLinkedInPostEngagement(row.platform_post_id);
    })
  );
  const engagements: PostEngagement[] = engagementResults
    .filter((r): r is PromiseFulfilledResult<PostEngagement | null> => r.status === 'fulfilled')
    .map(r => r.value)
    .filter((e): e is PostEngagement => e !== null);

  await Promise.all([
    accountStats.length > 0 ? recordAccountStatsSnapshot(accountStats) : Promise.resolve(),
    upsertPostEngagementCache(engagements),
    upsertPaidPostStatsCache(paidStats),
  ]);

  const durationMs = Date.now() - start;
  await recordRefreshStatus({
    durationMs,
    postsRefreshed: engagements.length,
    accountsRefreshed: accountStats.length,
  });

  console.log(
    `[dashboard-refresh] durationMs=${durationMs} accounts=${JSON.stringify(accountStats)} postsRefreshed=${engagements.length}/${postsToRefresh.length}`
  );

  // Overview is force-dynamic (always reads fresh from the DB on the server),
  // but the client-side Router Cache can still serve a stale RSC payload for
  // '/' if it was visited before this refresh ran. revalidatePath marks it
  // stale so the next visit — from the cron or the manual "Refresh now"
  // button alike — actually re-fetches instead of reusing that cached payload.
  revalidatePath('/');

  return { durationMs, accountsRefreshed: accountStats.length, postsRefreshed: engagements.length };
}
