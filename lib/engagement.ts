import { supabase } from '@/lib/supabase';

// v19.0 was already past Meta's ~2-year support window by the time this was
// last touched — bumped to the current stable version. Also matters for the
// metric-name fixes below: several post-insights metrics were deprecated in
// v22.0+ and only work on a current version.
const GRAPH_API = 'https://graph.facebook.com/v26.0';
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

// Meta deprecated the post_impressions/post_reach Page-insights metrics for
// organic posts effective June 15, 2026, with no per-post replacement — Page
// Insights only exposes them aggregated at the Page level now. Production
// logs confirmed every post now gets "(#100) The value must be a valid
// insights metric" for that clause, and because it used to be requested in
// the same combined `fields` string as likes/comments/shares, one dead
// metric was failing the *entire* request — likes/comments/shares included.
// Impressions/reach are fetched in a separate, best-effort call so losing
// them doesn't take down the rest, but expect them to stay 0: there's
// currently no Graph API metric that gives per-post reach/impressions for
// organic Facebook posts.
export async function getFacebookPostEngagement(postId: string): Promise<PostEngagement | null> {
  const token = process.env.INSTAGRAM_PAGE_ACCESS_TOKEN;
  if (!token) return null;
  const fields = 'likes.summary(true),comments.summary(true),shares';
  const res = await fetch(`${GRAPH_API}/${postId}?fields=${fields}&access_token=${token}`);
  if (!res.ok) {
    console.error(`Facebook getPostEngagement failed for ${postId}: ${res.status} ${await res.text()}`);
    return null;
  }
  const d = await res.json();

  let impressions = 0;
  let reach = 0;
  try {
    const ins = await fetch(`${GRAPH_API}/${postId}/insights?metric=post_impressions,post_reach&access_token=${token}`);
    if (ins.ok) {
      const insData = await ins.json();
      impressions = insData.data?.find((m: Record<string, string>) => m.name === 'post_impressions')?.values?.[0]?.value ?? 0;
      reach = insData.data?.find((m: Record<string, string>) => m.name === 'post_reach')?.values?.[0]?.value ?? 0;
    } else {
      console.error(`Facebook getPostEngagement insights failed for ${postId}: ${ins.status} ${await ins.text()}`);
    }
  } catch (err) {
    console.error(`Facebook getPostEngagement insights threw for ${postId}:`, err);
  }

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

// The `impressions` media-insights metric was deprecated in Graph API v22.0
// (April 2025) in favor of a single unified `views` metric — production logs
// confirmed every call here was getting "(#10) Application does not have
// permission for this action" on the old metric name. `views` is the
// current metric that plays the same role (it's what impressions folded
// into), so it's mapped onto this same `impressions` field rather than
// adding a new one. `reach` is unaffected and still valid.
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
      `${GRAPH_API}/${mediaId}/insights?metric=views,reach&access_token=${token}`
    );
    if (ins.ok) {
      const insData = await ins.json();
      impressions = insData.data?.find((m: Record<string, string>) => m.name === 'views')?.values?.[0]?.value ?? 0;
      reach = insData.data?.find((m: Record<string, string>) => m.name === 'reach')?.values?.[0]?.value ?? 0;
    } else {
      console.error(`Instagram getPostEngagement insights failed for ${mediaId}: ${ins.status} ${await ins.text()}`);
    }
  } catch (err) {
    console.error(`Instagram getPostEngagement insights threw for ${mediaId}:`, err);
  }

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

function linkedInOrgUrn(): string | null {
  const authorId = process.env.LINKEDIN_AUTHOR_ID_COMM;
  if (!authorId) return null;
  const orgId = authorId.replace('urn:li:organization:', '').replace('organization:', '');
  return `urn:li:organization:${orgId}`;
}

// socialMetadata's response shape changed since this was first written —
// production logs confirmed the real response only has reactionSummaries
// (per-reaction-type counts, e.g. {"LIKE": {count: N}, ...}) and
// commentSummary.count, not the old likesSummary/commentsSummary/
// sharesSummary/totalShareStatistics fields this used to read (which
// resolved everything to 0 via ?? fallbacks, silently). socialMetadata never
// exposes a share count or impressions at all — those come from a separate
// call below.
export async function getLinkedInPostEngagement(postUrn: string): Promise<PostEngagement | null> {
  const token = process.env.LINKEDIN_ACCESS_TOKEN_COMM;
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
  const reactionSummaries = d.reactionSummaries as Record<string, { count?: number }> | undefined;
  const likes = reactionSummaries
    ? Object.values(reactionSummaries).reduce((sum, r) => sum + (r.count ?? 0), 0)
    : 0;
  const comments = d.commentSummary?.count ?? 0;

  // Best-effort — needs the org's rw_organization_admin analytics access on
  // top of the read scope socialMetadata uses, which this token may not
  // carry. Falls back to 0 rather than failing the whole post.
  //
  // `shares[0]=` was never valid syntax for this Rest.li 2.0.0 call (the
  // X-Restli-Protocol-Version header below) — production logs confirmed
  // LinkedIn rejecting every single request with "QUERY_PARAM_NOT_ALLOWED"
  // on fieldPath "shares[0]", so impressions/reach silently fell back to 0
  // on every post, always, not just when the token lacked analytics access.
  // Rest.li 2.0 arrays are serialized as `shares=List(...)`, not indexed
  // bracket params.
  let impressions = 0;
  let reach = 0;
  const orgUrn = linkedInOrgUrn();
  if (orgUrn) {
    try {
      const statsRes = await fetch(
        `${LINKEDIN_REST_API}/organizationalEntityShareStatistics?q=organizationalEntity&organizationalEntity=${encodeURIComponent(orgUrn)}&shares=List(${encoded})`,
        {
          headers: {
            Authorization: `Bearer ${token}`,
            'X-Restli-Protocol-Version': '2.0.0',
            'LinkedIn-Version': LINKEDIN_API_VERSION,
          },
        }
      );
      if (statsRes.ok) {
        const statsData = await statsRes.json();
        const stats = statsData.elements?.[0]?.totalShareStatistics;
        impressions = stats?.impressionCount ?? 0;
        reach = stats?.uniqueImpressionsCount ?? 0;
      } else {
        console.error(`LinkedIn getPostEngagement share statistics failed for ${postUrn}: ${statsRes.status} ${await statsRes.text()}`);
      }
    } catch (err) {
      console.error(`LinkedIn getPostEngagement share statistics threw for ${postUrn}:`, err);
    }
  }

  return {
    platform: 'linkedin',
    postId: postUrn,
    likes,
    comments,
    shares: 0,
    impressions,
    reach,
  };
}

// Follower stats need the Community Management API's org-social read scope,
// which lives on a separate token/author id from the one used for posting
// (LINKEDIN_ACCESS_TOKEN/LINKEDIN_AUTHOR_ID) — that one only carries posting
// scopes and can't call this endpoint.
export async function getLinkedInAccountStats(): Promise<AccountStats | null> {
  const token = process.env.LINKEDIN_ACCESS_TOKEN_COMM;
  const orgUrn = linkedInOrgUrn();
  if (!token || !orgUrn) return null;

  // organizationalEntityFollowerStatistics only exposes demographic
  // breakdowns (byAssociationType/bySeniority/byIndustry/...), and every one
  // of them undercounts — each has gaps for followers with an unfilled
  // profile attribute in that dimension, confirmed by comparing all of them
  // against the real known follower count (all came back 28-35 vs. the
  // actual 45). None of them is an exhaustive total by design; summing any
  // facet is the wrong approach. networkSizes is LinkedIn's endpoint
  // specifically for an exact total follower count.
  // edgeType's enum value changed from "CompanyFollowedByMember" (<=v202304)
  // to "COMPANY_FOLLOWED_BY_MEMBER" (v202305+) — LINKEDIN_API_VERSION here
  // defaults to 202601, well past that cutover.
  const res = await fetch(
    `${LINKEDIN_REST_API}/networkSizes/${encodeURIComponent(orgUrn)}?edgeType=COMPANY_FOLLOWED_BY_MEMBER`,
    {
      headers: {
        Authorization: `Bearer ${token}`,
        'X-Restli-Protocol-Version': '2.0.0',
        'LinkedIn-Version': LINKEDIN_API_VERSION,
      },
    }
  );
  if (!res.ok) {
    console.error(`LinkedIn getAccountStats (networkSizes) failed for ${orgUrn}: ${res.status} ${await res.text()}`);
    return null;
  }
  const d = await res.json();
  return { platform: 'linkedin', followers: d.firstDegreeSize ?? 0 };
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
  // Multiple snapshots can land on the same calendar day (e.g. several
  // manual refreshes), and consumers pick one point per platform per day —
  // keep only the latest snapshot for each (platform, date) pair rather than
  // however the first one they happen to encounter, which used to surface a
  // stale earlier-in-the-day value instead of the most current one.
  const latestByPlatformDate = new Map<string, FollowerHistoryPoint>();
  for (const r of data ?? []) {
    const date = (r.captured_at as string).split('T')[0];
    latestByPlatformDate.set(`${r.platform}:${date}`, { platform: r.platform, date, followers: r.followers });
  }
  return Array.from(latestByPlatformDate.values()).sort((a, b) => a.date.localeCompare(b.date));
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

// ─── Engagement over time ───────────────────────────────────────────────────

export interface EngagementOverTimePoint {
  date: string;
  impressions: number;
  reach: number;
  likes: number;
  comments: number;
}

/** Daily engagement totals across all three platforms, for posts published in the window — joins marketing_plan (dates) with post_engagement_cache (metrics) via getCachedPostEngagements. */
export async function getEngagementOverTime(days = 14): Promise<EngagementOverTimePoint[]> {
  const since = new Date();
  since.setDate(since.getDate() - days);
  const sinceDate = since.toISOString().split('T')[0];

  const { data: posts, error } = await supabase
    .from('marketing_plan')
    .select('platform, platform_post_id, scheduled_date')
    .eq('status', 'posted')
    .gte('scheduled_date', sinceDate)
    .not('platform_post_id', 'is', null);
  if (error) throw new Error(error.message);
  if (!posts || posts.length === 0) return [];

  const engagements = await getCachedPostEngagements(
    posts.map(p => ({ platform: p.platform, platform_post_id: p.platform_post_id }))
  );
  const byKey = new Map(engagements.map(e => [`${e.platform}:${e.postId}`, e]));

  const byDate = new Map<string, EngagementOverTimePoint>();
  for (const p of posts) {
    const e = byKey.get(`${p.platform}:${p.platform_post_id}`);
    if (!e) continue;
    const point = byDate.get(p.scheduled_date) ?? { date: p.scheduled_date, impressions: 0, reach: 0, likes: 0, comments: 0 };
    point.impressions += e.impressions;
    point.reach += e.reach;
    point.likes += e.likes;
    point.comments += e.comments;
    byDate.set(p.scheduled_date, point);
  }
  return Array.from(byDate.values()).sort((a, b) => a.date.localeCompare(b.date));
}

// ─── Top-performing posts ────────────────────────────────────────────────────

// String.slice() cuts by UTF-16 code unit, which can land inside a surrogate
// pair (any emoji, common in these posts) and leave a dangling lone
// surrogate. That's invalid JSON once this preview round-trips through a
// tool_result back into a later Anthropic API request — confirmed in
// production as "The request body is not valid JSON: no low surrogate in
// string", which broke Pepe's entire turn (post-engagement research)
// with no way to recover mid-conversation. Array.from() splits by Unicode
// code point instead, so a surrogate pair always stays intact.
function truncatePreview(content: string, maxLen: number): string {
  if (content.length <= maxLen) return content;
  return `${Array.from(content).slice(0, maxLen).join('')}...`;
}

export type PerformanceMetric = 'likes' | 'comments' | 'shares' | 'impressions' | 'reach' | 'engagement_rate';

export interface PostPerformance {
  postId: string;
  platform: 'linkedin' | 'instagram' | 'facebook';
  scheduledDate: string;
  scheduledTime: string;
  contentPreview: string;
  postUrl?: string;
  likes: number;
  comments: number;
  shares: number;
  impressions: number;
  reach: number;
  engagementRate: number;
  postType?: 'video' | 'standard';
}

function performanceMetricValue(p: PostPerformance, metric: PerformanceMetric): number {
  switch (metric) {
    case 'likes': return p.likes;
    case 'comments': return p.comments;
    case 'shares': return p.shares;
    case 'impressions': return p.impressions;
    case 'reach': return p.reach;
    case 'engagement_rate': return p.engagementRate;
  }
}

interface PostedRow {
  id: string;
  platform: 'linkedin' | 'instagram' | 'facebook';
  scheduled_date: string;
  scheduled_time: string;
  content: string;
  post_url: string | null;
  platform_post_id: string | null;
  post_type?: 'video' | 'standard';
}

async function getPostedRows(options: {
  platform?: 'linkedin' | 'instagram' | 'facebook';
  dateFrom?: string;
  dateTo?: string;
  limit?: number;
} = {}): Promise<PostedRow[]> {
  let query = supabase
    .from('marketing_plan')
    .select('id, platform, scheduled_date, scheduled_time, content, post_url, platform_post_id, post_type')
    .eq('status', 'posted')
    .not('platform_post_id', 'is', null)
    .order('scheduled_date', { ascending: false });
  if (options.platform) query = query.eq('platform', options.platform);
  if (options.dateFrom) query = query.gte('scheduled_date', options.dateFrom);
  if (options.dateTo) query = query.lte('scheduled_date', options.dateTo);
  if (options.limit) query = query.limit(options.limit);
  const { data, error } = await query;
  if (error) throw new Error(error.message);
  return data ?? [];
}

/** The (platform, platform_post_id) pairs the daily refresh cron needs to
 * keep the Performance leaderboard's stats genuinely fresh — every published
 * post up to the same 300-post cap getPerformanceLeaderboard reads from,
 * not just the comment-reply window getPostedPostsForCommentCheck covers
 * (which exists for a different purpose and only looks back 7-30 days). */
export async function getPostsForPerformanceRefresh(): Promise<{ platform: 'linkedin' | 'instagram' | 'facebook'; platform_post_id: string }[]> {
  const rows = await getPostedRows({ limit: 300 });
  return rows
    .filter((r): r is PostedRow & { platform_post_id: string } => r.platform_post_id !== null)
    .map(r => ({ platform: r.platform, platform_post_id: r.platform_post_id }));
}

// Shared by getTopPerformingPosts, getPerformanceLeaderboard, and
// getBestPostsInRange — all three start from a set of posted marketing_plan
// rows and need the same join against post_engagement_cache to turn them
// into PostPerformance.
async function buildPostPerformance(rows: PostedRow[]): Promise<PostPerformance[]> {
  const withPlatformPostId = rows.filter((r): r is PostedRow & { platform_post_id: string } => r.platform_post_id !== null);
  if (withPlatformPostId.length === 0) return [];

  const engagements = await getCachedPostEngagements(
    withPlatformPostId.map(p => ({ platform: p.platform, platform_post_id: p.platform_post_id }))
  );
  const byKey = new Map(engagements.map(e => [`${e.platform}:${e.postId}`, e]));

  return withPlatformPostId
    .map((p): PostPerformance | null => {
      const e = byKey.get(`${p.platform}:${p.platform_post_id}`);
      if (!e) return null;
      return {
        postId: p.id,
        platform: p.platform,
        scheduledDate: p.scheduled_date,
        scheduledTime: p.scheduled_time,
        contentPreview: truncatePreview(p.content, 120),
        postUrl: p.post_url ?? undefined,
        likes: e.likes,
        comments: e.comments,
        shares: e.shares,
        impressions: e.impressions,
        reach: e.reach,
        engagementRate: computeEngagementRate(e),
        postType: p.post_type,
      };
    })
    .filter((p): p is PostPerformance => p !== null);
}

/** Every published post, ranked by the requested metric — for "which post did best" / "top 5 by X" questions, unlike getCachedPostEngagements (which only looks up a given list) or compare_posts (fixed at two). No lookback window: unlike getPostedPostsForCommentCheck, ranking needs the full history, not just the recent window comment-replying cares about. */
export async function getTopPerformingPosts(options: {
  metric?: PerformanceMetric;
  platform?: 'linkedin' | 'instagram' | 'facebook';
  limit?: number;
} = {}): Promise<PostPerformance[]> {
  const { metric = 'likes', platform, limit = 5 } = options;
  const rows = await getPostedRows({ platform });
  const performance = await buildPostPerformance(rows);
  performance.sort((a, b) => performanceMetricValue(b, metric) - performanceMetricValue(a, metric));
  return performance.slice(0, limit);
}

// ─── Composite performance score ────────────────────────────────────────────
//
// Five stats: likes, comments, shares, reach, and engagement rate. Impressions
// is deliberately left out — Meta deprecated per-post impressions/reach for
// organic Facebook posts (see getFacebookPostEngagement above), so it's
// always 0 there and would just be dead weight in the score.
//
// Each stat is min-max normalized to 0-100 across whatever set is being
// scored (so a scale difference — reach in the hundreds vs. shares in the
// single digits — can't let one stat dominate by magnitude alone), then
// combined with fixed weights. Comments and shares are weighted highest:
// both take more effort from a follower than a passive like, so they're a
// stronger signal of genuine engagement. Reach is weighted lowest since it's
// the least reliable across platforms (0 for every Facebook post).

export interface RankedPostPerformance extends PostPerformance {
  score: number;
}

const SCORE_WEIGHTS = { likes: 0.20, comments: 0.25, shares: 0.20, reach: 0.15, engagementRate: 0.20 } as const;

function normalize(value: number, min: number, max: number): number {
  // Every post tying on this stat (max === min) contributes the same amount
  // to every post's score either way — 100 is as good a constant as any,
  // and avoids a 0/0 division.
  return max > min ? ((value - min) / (max - min)) * 100 : 100;
}

function scorePerformance<T extends Pick<PostPerformance, 'likes' | 'comments' | 'shares' | 'reach' | 'engagementRate'>>(
  list: T[]
): (T & { score: number })[] {
  if (list.length === 0) return [];
  const range = (values: number[]) => ({ min: Math.min(...values), max: Math.max(...values) });
  const likes = range(list.map(p => p.likes));
  const comments = range(list.map(p => p.comments));
  const shares = range(list.map(p => p.shares));
  const reach = range(list.map(p => p.reach));
  const rate = range(list.map(p => p.engagementRate));

  return list.map(p => ({
    ...p,
    score: Math.round(
      (normalize(p.likes, likes.min, likes.max) * SCORE_WEIGHTS.likes +
        normalize(p.comments, comments.min, comments.max) * SCORE_WEIGHTS.comments +
        normalize(p.shares, shares.min, shares.max) * SCORE_WEIGHTS.shares +
        normalize(p.reach, reach.min, reach.max) * SCORE_WEIGHTS.reach +
        normalize(p.engagementRate, rate.min, rate.max) * SCORE_WEIGHTS.engagementRate) *
        10
    ) / 10,
  }));
}

/** All-time performance leaderboard for the dashboard's Performance page —
 * every published post (capped at 300, a sanity limit far beyond current
 * volume) ranked by the composite score above rather than a single metric.
 * Returns both the paginated slice and the total scored count so the UI can
 * display "Showing X of Y posts". */
export async function getPerformanceLeaderboard(limit = 50): Promise<{ posts: RankedPostPerformance[]; total: number }> {
  const rows = await getPostedRows({ limit: 300 });
  const performance = await buildPostPerformance(rows);
  const ranked = scorePerformance(performance);
  ranked.sort((a, b) => b.score - a.score);
  const total = ranked.length;
  return { posts: ranked.slice(0, limit), total };
}

/** The single best-scoring post per platform among posts posted within
 * [dateFrom, dateTo] — used for the planner's per-platform "best post of the
 * week" crown. Scored only against others in the same window, not the
 * all-time set, so "best this week" means best relative to this week rather
 * than to the account's entire history. */
export async function getBestPostsInRange(
  dateFrom: string,
  dateTo: string
): Promise<Partial<Record<'linkedin' | 'instagram' | 'facebook', string>>> {
  const rows = await getPostedRows({ dateFrom, dateTo });
  const performance = await buildPostPerformance(rows);
  const ranked = scorePerformance(performance);

  const best: Partial<Record<'linkedin' | 'instagram' | 'facebook', string>> = {};
  const bestScore: Partial<Record<'linkedin' | 'instagram' | 'facebook', number>> = {};
  for (const p of ranked) {
    const currentBest = bestScore[p.platform];
    if (currentBest === undefined || p.score > currentBest) {
      bestScore[p.platform] = p.score;
      best[p.platform] = p.postId;
    }
  }
  return best;
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
