import { revalidatePath } from 'next/cache';
import {
  getAllAccountStats,
  recordAccountStatsSnapshot,
  upsertPostEngagementCache,
  recordRefreshStatus,
  getFacebookPostEngagement,
  getInstagramPostEngagement,
  getLinkedInPostEngagement,
  type PostEngagement,
} from '@/lib/engagement';
import { getPostedPostsForCommentCheck } from '@/lib/marketing-plan';

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

  const [accountStats, recentPosts] = await Promise.all([
    getAllAccountStats(),
    getPostedPostsForCommentCheck(),
  ]);

  const engagementResults = await Promise.allSettled(
    recentPosts.map(row => {
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
  ]);

  const durationMs = Date.now() - start;
  await recordRefreshStatus({
    durationMs,
    postsRefreshed: engagements.length,
    accountsRefreshed: accountStats.length,
  });

  console.log(
    `[dashboard-refresh] durationMs=${durationMs} accounts=${JSON.stringify(accountStats)} postsRefreshed=${engagements.length}/${recentPosts.length}`
  );

  // Overview is force-dynamic (always reads fresh from the DB on the server),
  // but the client-side Router Cache can still serve a stale RSC payload for
  // '/' if it was visited before this refresh ran. revalidatePath marks it
  // stale so the next visit — from the cron or the manual "Refresh now"
  // button alike — actually re-fetches instead of reusing that cached payload.
  revalidatePath('/');

  return { durationMs, accountsRefreshed: accountStats.length, postsRefreshed: engagements.length };
}
