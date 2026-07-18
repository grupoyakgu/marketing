import { supabase } from '@/lib/supabase';

const GRAPH_API = 'https://graph.facebook.com/v19.0';
// LinkedIn blocks the legacy unversioned /v2 API for these resources (see
// social-comments.ts) — organization stats need the versioned /rest API with
// a LinkedIn-Version header. networkSizes is also deprecated outright; its
// replacement is organizationalEntityFollowerStatistics.
// LinkedIn only keeps roughly the last 12 months of versions active, so this
// default needs bumping periodically (bump LINKEDIN_API_VERSION in Vercel env
// vars instead of redeploying if this goes stale again).
const LINKEDIN_REST_API = 'https://api.linkedin.com/rest';
const LINKEDIN_API_VERSION = process.env.LINKEDIN_API_VERSION ?? '202601';

export interface PostEngagement {
  platform: 'linkedin' | 'instagram' | 'facebook';
  postId: string;
  likes: number;
  comments: number;
  shares: number;
  impressions: number;
  reach: number;
}

export interface AccountStats {
  platform: 'linkedin' | 'instagram' | 'facebook';
  followers: number;
  following?: number;
}

export function computeEngagementRate(e: PostEngagement): number {
  const totalEngagements = e.likes + e.comments + e.shares;
  const base = e.impressions > 0 ? e.impressions : e.reach;
  return base > 0 ? (totalEngagements / base) * 100 : 0;
}

// ─── Facebook ────────────────────────────────────────────────────────────────

export async function getFacebookPostEngagement(postId: string): Promise<PostEngagement | null> {
  const token = process.env.INSTAGRAM_PAGE_ACCESS_TOKEN;
  if (!token) return null;
  const fields = 'likes.summary(true),comments.summary(true),shares,insights.metric(post_impressions,post_reach)';
  const res = await fetch(`${GRAPH_API}/${postId}?fields=${fields}&access_token=${token}`);
  if (!res.ok) {
    console.error(`Facebook getPostEngagement failed for ${postId}: ${res.status} ${await res.text()}`);
    return null;
  }
  const d = await res.json();
  const impressions = d.insights?.data?.find((m: Record<string, string>) => m.name === 'post_impressions')?.values?.[0]?.value ?? 0;
  const reach = d.insights?.data?.find((m: Record<string, string>) => m.name === 'post_reach')?.values?.[0]?.value ?? 0;
  return {
    platform: 'facebook',
    postId,
    likes: d.likes?.summary?.total_count ?? 0,
    comments: d.comments?.summary?.total_count ?? 0,
    shares: d.shares?.count ?? 0,
    impressions,
    reach,
  };
}

export async function getFacebookAccountStats(): Promise<AccountStats | null> {
  const token = process.env.INSTAGRAM_PAGE_ACCESS_TOKEN;
  const pageId = process.env.FACEBOOK_PAGE_ID;
  if (!token || !pageId) return null;
  const res = await fetch(`${GRAPH_API}/${pageId}?fields=followers_count,fan_count&access_token=${token}`);
  if (!res.ok) {
    console.error(`Facebook getAccountStats failed for ${pageId}: ${res.status} ${await res.text()}`);
    return null;
  }
  const d = await res.json();
  return { platform: 'facebook', followers: d.followers_count ?? d.fan_count ?? 0 };
}

// ─── Instagram ───────────────────────────────────────────────────────────────

export async function getInstagramPostEngagement(mediaId: string): Promise<PostEngagement | null> {
  const token = process.env.INSTAGRAM_PAGE_ACCESS_TOKEN;
  const igId = process.env.INSTAGRAM_BUSINESS_ACCOUNT_ID;
  if (!token || !igId) return null;
  // Basic fields available on all media
  const res = await fetch(
    `${GRAPH_API}/${mediaId}?fields=like_count,comments_count&access_token=${token}`
  );
  if (!res.ok) {
    console.error(`Instagram getPostEngagement failed for ${mediaId}: ${res.status} ${await res.text()}`);
    return null;
  }
  const d = await res.json();

  // Insights require a separate call (only available on business accounts)
  let impressions = 0;
  let reach = 0;
  try {
    const ins = await fetch(
      `${GRAPH_API}/${mediaId}/insights?metric=impressions,reach&access_token=${token}`
    );
    if (ins.ok) {
      const insData = await ins.json();
      impressions = insData.data?.find((m: Record<string, string>) => m.name === 'impressions')?.values?.[0]?.value ?? 0;
      reach = insData.data?.find((m: Record<string, string>) => m.name === 'reach')?.values?.[0]?.value ?? 0;
    }
  } catch {}

  return {
    platform: 'instagram',
    postId: mediaId,
    likes: d.like_count ?? 0,
    comments: d.comments_count ?? 0,
    shares: 0,
    impressions,
    reach,
  };
}

export async function getInstagramAccountStats(): Promise<AccountStats | null> {
  const token = process.env.INSTAGRAM_PAGE_ACCESS_TOKEN;
  const igId = process.env.INSTAGRAM_BUSINESS_ACCOUNT_ID;
  if (!token || !igId) return null;
  const res = await fetch(`${GRAPH_API}/${igId}?fields=followers_count&access_token=${token}`);
  if (!res.ok) {
    console.error(`Instagram getAccountStats failed for ${igId}: ${res.status} ${await res.text()}`);
    return null;
  }
  const d = await res.json();
  return { platform: 'instagram', followers: d.followers_count ?? 0 };
}

// ─── LinkedIn ─────────────────────────────────────────────────────────────────

export async function getLinkedInPostEngagement(postUrn: string): Promise<PostEngagement | null> {
  const token = process.env.LINKEDIN_ACCESS_TOKEN;
  if (!token) return null;
  const encoded = encodeURIComponent(postUrn);
  const res = await fetch(
    `${LINKEDIN_REST_API}/socialMetadata/${encoded}`,
    {
      headers: {
        Authorization: `Bearer ${token}`,
        'X-Restli-Protocol-Version': '2.0.0',
        'LinkedIn-Version': LINKEDIN_API_VERSION,
      },
    }
  );
  if (!res.ok) {
    console.error(`LinkedIn getPostEngagement failed for ${postUrn}: ${res.status} ${await res.text()}`);
    return null;
  }
  const d = await res.json();
  return {
    platform: 'linkedin',
    postId: postUrn,
    likes: d.likesSummary?.totalLikes ?? 0,
    comments: d.commentsSummary?.totalFirstLevelComments ?? 0,
    shares: d.sharesSummary?.totalShares ?? 0,
    impressions: d.totalShareStatistics?.impressionCount ?? 0,
    reach: d.totalShareStatistics?.uniqueImpressionsCount ?? 0,
  };
}

export async function getLinkedInAccountStats(): Promise<AccountStats | null> {
  const token = process.env.LINKEDIN_ACCESS_TOKEN;
  const authorId = process.env.LINKEDIN_AUTHOR_ID;
  if (!token || !authorId) return null;
  const orgId = authorId.replace('urn:li:organization:', '').replace('organization:', '');
  const orgUrn = `urn:li:organization:${orgId}`;
  const res = await fetch(
    `${LINKEDIN_REST_API}/organizationalEntityFollowerStatistics?q=organizationalEntity&organizationalEntity=${encodeURIComponent(orgUrn)}`,
    {
      headers: {
        Authorization: `Bearer ${token}`,
        'X-Restli-Protocol-Version': '2.0.0',
        'LinkedIn-Version': LINKEDIN_API_VERSION,
      },
    }
  );
  if (!res.ok) {
    console.error(`LinkedIn getAccountStats failed for ${orgUrn}: ${res.status} ${await res.text()}`);
    return null;
  }
  const d = await res.json();
  const counts = d.elements?.[0]?.followerCounts;
  const followers = (counts?.organicFollowerCount ?? 0) + (counts?.paidFollowerCount ?? 0);
  return { platform: 'linkedin', followers };
}

// ─── Aggregate ────────────────────────────────────────────────────────────────

export async function getAllAccountStats(): Promise<AccountStats[]> {
  const results = await Promise.allSettled([
    getFacebookAccountStats(),
    getInstagramAccountStats(),
    getLinkedInAccountStats(),
  ]);
  return results
    .map(r => (r.status === 'fulfilled' ? r.value : null))
    .filter((s): s is AccountStats => s !== null);
}

// ─── Follower growth history ──────────────────────────────────────────────

export interface FollowerGrowth {
  platform: 'linkedin' | 'instagram' | 'facebook';
  followers: number;
  previousFollowers: number | null;
  delta: number | null;
  deltaPct: number | null;
}

/** Looks up each platform's most recent snapshot from ~a week ago (or earlier) to compute growth. Call before recordAccountStatsSnapshot for the current run. */
export async function getAccountGrowth(stats: AccountStats[]): Promise<FollowerGrowth[]> {
  const sixDaysAgo = new Date(Date.now() - 6 * 24 * 60 * 60 * 1000).toISOString();

  return Promise.all(
    stats.map(async s => {
      const { data } = await supabase
        .from('account_stats_history')
        .select('followers')
        .eq('platform', s.platform)
        .lte('captured_at', sixDaysAgo)
        .order('captured_at', { ascending: false })
        .limit(1);

      const previousFollowers = data?.[0]?.followers ?? null;
      const delta = previousFollowers !== null ? s.followers - previousFollowers : null;
      const deltaPct = previousFollowers ? ((delta as number) / previousFollowers) * 100 : null;
      return { platform: s.platform, followers: s.followers, previousFollowers, delta, deltaPct };
    })
  );
}

export async function recordAccountStatsSnapshot(stats: AccountStats[]): Promise<void> {
  if (stats.length === 0) return;
  const { error } = await supabase
    .from('account_stats_history')
    .insert(stats.map(s => ({ platform: s.platform, followers: s.followers })));
  if (error) console.error(`recordAccountStatsSnapshot insert failed: ${error.message}`);
}

export interface FollowerHistoryPoint {
  platform: 'linkedin' | 'instagram' | 'facebook';
  date: string;
  followers: number;
}

export async function getFollowerHistory(days = 30): Promise<FollowerHistoryPoint[]> {
  const since = new Date(Date.now() - days * 24 * 60 * 60 * 1000).toISOString();
  const { data, error } = await supabase
    .from('account_stats_history')
    .select('platform, followers, captured_at')
    .gte('captured_at', since)
    .order('captured_at', { ascending: true });
  if (error) throw new Error(error.message);
  return (data ?? []).map(r => ({
    platform: r.platform,
    date: (r.captured_at as string).split('T')[0],
    followers: r.followers,
  }));
}

/** Most recent snapshot per platform from account_stats_history — DB-only, used by the dashboard instead of calling getAllAccountStats() live on every page load. */
export async function getLatestAccountStats(): Promise<AccountStats[]> {
  const { data, error } = await supabase
    .from('account_stats_history')
    .select('platform, followers, captured_at')
    .order('captured_at', { ascending: false })
    .limit(20);
  if (error) throw new Error(error.message);
  const seen = new Set<string>();
  const result: AccountStats[] = [];
  for (const row of data ?? []) {
    if (seen.has(row.platform)) continue;
    seen.add(row.platform);
    result.push({ platform: row.platform, followers: row.followers });
  }
  return result;
}

// ─── Post engagement cache ─────────────────────────────────────────────────

export async function getCachedPostEngagements(
  posts: { platform: 'linkedin' | 'instagram' | 'facebook'; platform_post_id: string }[]
): Promise<PostEngagement[]> {
  if (posts.length === 0) return [];
  const platforms = Array.from(new Set(posts.map(p => p.platform)));
  const ids = Array.from(new Set(posts.map(p => p.platform_post_id)));
  const { data, error } = await supabase
    .from('post_engagement_cache')
    .select('platform, platform_post_id, likes, comments, shares, impressions, reach')
    .in('platform', platforms)
    .in('platform_post_id', ids);
  if (error) throw new Error(error.message);
  const wanted = new Set(posts.map(p => `${p.platform}:${p.platform_post_id}`));
  return (data ?? [])
    .filter(r => wanted.has(`${r.platform}:${r.platform_post_id}`))
    .map(r => ({
      platform: r.platform,
      postId: r.platform_post_id,
      likes: r.likes,
      comments: r.comments,
      shares: r.shares,
      impressions: r.impressions,
      reach: r.reach,
    }));
}

export async function upsertPostEngagementCache(engagements: PostEngagement[]): Promise<void> {
  if (engagements.length === 0) return;
  await supabase.from('post_engagement_cache').upsert(
    engagements.map(e => ({
      platform: e.platform,
      platform_post_id: e.postId,
      likes: e.likes,
      comments: e.comments,
      shares: e.shares,
      impressions: e.impressions,
      reach: e.reach,
      updated_at: new Date().toISOString(),
    })),
    { onConflict: 'platform,platform_post_id' }
  );
}

// ─── Refresh status ─────────────────────────────────────────────────────────

export interface RefreshStatus {
  refreshedAt: string | null;
  durationMs: number | null;
  postsRefreshed: number | null;
  accountsRefreshed: number | null;
}

export async function getRefreshStatus(): Promise<RefreshStatus> {
  const { data } = await supabase
    .from('dashboard_refresh_status')
    .select('refreshed_at, duration_ms, posts_refreshed, accounts_refreshed')
    .eq('id', 'singleton')
    .maybeSingle();
  return {
    refreshedAt: data?.refreshed_at ?? null,
    durationMs: data?.duration_ms ?? null,
    postsRefreshed: data?.posts_refreshed ?? null,
    accountsRefreshed: data?.accounts_refreshed ?? null,
  };
}

export async function recordRefreshStatus(status: {
  durationMs: number;
  postsRefreshed: number;
  accountsRefreshed: number;
}): Promise<void> {
  await supabase.from('dashboard_refresh_status').upsert({
    id: 'singleton',
    refreshed_at: new Date().toISOString(),
    duration_ms: status.durationMs,
    posts_refreshed: status.postsRefreshed,
    accounts_refreshed: status.accountsRefreshed,
  });
}
