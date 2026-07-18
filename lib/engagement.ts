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
  if (!res.ok) return null;
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
  if (!res.ok) return null;
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
  if (!res.ok) return null;
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
  if (!res.ok) return null;
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

  const results: FollowerGrowth[] = [];
  for (const s of stats) {
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
    results.push({ platform: s.platform, followers: s.followers, previousFollowers, delta, deltaPct });
  }
  return results;
}

export async function recordAccountStatsSnapshot(stats: AccountStats[]): Promise<void> {
  if (stats.length === 0) return;
  await supabase
    .from('account_stats_history')
    .insert(stats.map(s => ({ platform: s.platform, followers: s.followers })));
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
