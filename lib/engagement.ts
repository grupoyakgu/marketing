const GRAPH_API = 'https://graph.facebook.com/v19.0';
const LINKEDIN_API = 'https://api.linkedin.com/v2';

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
    `${LINKEDIN_API}/socialMetadata/${encoded}`,
    {
      headers: {
        Authorization: `Bearer ${token}`,
        'X-Restli-Protocol-Version': '2.0.0',
      },
    }
  );
  if (!res.ok) return null;
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
  const res = await fetch(
    `${LINKEDIN_API}/networkSizes/urn:li:organization:${orgId}?edgeType=CompanyFollowedByMember`,
    {
      headers: {
        Authorization: `Bearer ${token}`,
        'X-Restli-Protocol-Version': '2.0.0',
      },
    }
  );
  if (!res.ok) return null;
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
