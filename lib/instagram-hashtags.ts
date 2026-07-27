import { supabase } from './supabase';

const GRAPH_API = 'https://graph.facebook.com/v19.0';

export interface HashtagTopPost {
  permalink: string;
  likeCount: number;
  commentsCount: number;
  caption: string | null;
  timestamp: string;
}

export interface HashtagStats {
  tag: string;
  mediaCount: number;
  avgLikes: number;
  avgComments: number;
  topPosts: HashtagTopPost[];
  fetchedAt: string;
}

function normalizeTag(tag: string): string {
  return tag.replace(/^#/, '').trim().toLowerCase();
}

// hashtag_id is permanent once discovered — cache it forever so a repeat
// search never touches ig_hashtag_search again. That endpoint specifically
// (hashtag *discovery*) is capped at 30 unique hashtags per rolling 7 days
// per Instagram Business Account; reading top_media for an id we already
// know is a normal Graph read and isn't subject to that cap.
async function getCachedHashtagId(tag: string): Promise<string | null> {
  const { data, error } = await supabase.from('hashtag_stats').select('hashtag_id').eq('tag', tag).maybeSingle();
  if (error) {
    console.error(`Hashtag getCachedHashtagId failed for ${tag}: ${error.message}`);
    return null;
  }
  return data?.hashtag_id ?? null;
}

async function discoverHashtagId(tag: string, token: string, igUserId: string): Promise<string | null> {
  const params = new URLSearchParams({ user_id: igUserId, q: tag, access_token: token });
  const res = await fetch(`${GRAPH_API}/ig_hashtag_search?${params}`, { cache: 'no-store' });
  const json = await res.json();
  if (!res.ok) {
    console.error(`Instagram Hashtag discoverHashtagId failed for ${tag}: ${res.status} ${JSON.stringify(json)}`);
    return null;
  }
  return json.data?.[0]?.id ?? null;
}

async function fetchTopMedia(hashtagId: string, token: string, igUserId: string): Promise<Record<string, unknown>[]> {
  const params = new URLSearchParams({
    user_id: igUserId,
    fields: 'id,caption,comments_count,like_count,media_type,permalink,timestamp',
    access_token: token,
  });
  const res = await fetch(`${GRAPH_API}/${hashtagId}/top_media?${params}`, { cache: 'no-store' });
  const json = await res.json();
  if (!res.ok) {
    console.error(`Instagram Hashtag fetchTopMedia failed for ${hashtagId}: ${res.status} ${JSON.stringify(json)}`);
    return [];
  }
  return json.data ?? [];
}

function average(nums: number[]): number {
  return nums.length ? nums.reduce((a, b) => a + b, 0) / nums.length : 0;
}

/** Read-only: returns engagement stats (avg likes/comments, top posts) for a
 * hashtag's current public top-performing posts. Purely for content/trend
 * research — Instagram's API has no endpoint to interact with posts this
 * surfaces, by design, so this can never be used to comment on them. */
export async function searchHashtag(rawTag: string): Promise<HashtagStats | { error: string }> {
  const token = process.env.INSTAGRAM_PAGE_ACCESS_TOKEN;
  const igUserId = process.env.INSTAGRAM_BUSINESS_ACCOUNT_ID;
  if (!token || !igUserId) return { error: 'Instagram is not configured.' };

  const tag = normalizeTag(rawTag);
  if (!tag) return { error: 'A hashtag is required.' };

  let hashtagId = await getCachedHashtagId(tag);
  if (!hashtagId) {
    hashtagId = await discoverHashtagId(tag, token, igUserId);
    if (!hashtagId) return { error: `Could not find an Instagram hashtag matching "${tag}".` };
  }

  const media = await fetchTopMedia(hashtagId, token, igUserId);
  const topPosts: HashtagTopPost[] = media
    .slice()
    .sort((a, b) => Number(b.like_count ?? 0) - Number(a.like_count ?? 0))
    .slice(0, 5)
    .map(m => ({
      permalink: (m.permalink as string) ?? '',
      likeCount: Number(m.like_count ?? 0),
      commentsCount: Number(m.comments_count ?? 0),
      caption: (m.caption as string) ?? null,
      timestamp: (m.timestamp as string) ?? '',
    }));

  const stats: HashtagStats = {
    tag,
    mediaCount: media.length,
    avgLikes: average(media.map(m => Number(m.like_count ?? 0))),
    avgComments: average(media.map(m => Number(m.comments_count ?? 0))),
    topPosts,
    fetchedAt: new Date().toISOString(),
  };

  const { error } = await supabase.from('hashtag_stats').upsert({
    tag,
    hashtag_id: hashtagId,
    media_count: stats.mediaCount,
    avg_likes: stats.avgLikes,
    avg_comments: stats.avgComments,
    top_posts: stats.topPosts,
    fetched_at: stats.fetchedAt,
  });
  if (error) console.error(`Hashtag stats upsert failed for ${tag}: ${error.message}`);

  return stats;
}

// INSTAGRAM_TRACKED_HASHTAGS accepts a comma-separated list, mirroring the
// same convention as FACEBOOK_AD_ACCOUNT_ID / CLOUDINARY_GALLERY_FOLDERS.
export function getConfiguredHashtags(): string[] {
  const raw = process.env.INSTAGRAM_TRACKED_HASHTAGS;
  if (!raw) return [];
  return raw.split(',').map(normalizeTag).filter(Boolean);
}

export async function refreshTrackedHashtags(): Promise<{ refreshed: string[]; failed: string[] }> {
  const tags = getConfiguredHashtags();
  const refreshed: string[] = [];
  const failed: string[] = [];
  // Sequential on purpose — a handful of tracked hashtags at most, and this
  // keeps request pacing gentle against Meta's rate limits rather than
  // bursting them all in parallel.
  for (const tag of tags) {
    const result = await searchHashtag(tag);
    if ('error' in result) failed.push(tag);
    else refreshed.push(tag);
  }
  return { refreshed, failed };
}

export async function getTrackedHashtagStats(): Promise<HashtagStats[]> {
  const tags = getConfiguredHashtags();
  if (tags.length === 0) return [];

  const { data, error } = await supabase.from('hashtag_stats').select('*').in('tag', tags);
  if (error) {
    console.error(`getTrackedHashtagStats failed: ${error.message}`);
    return [];
  }
  const byTag = new Map((data ?? []).map(row => [row.tag as string, row]));
  return tags
    .map(tag => byTag.get(tag))
    .filter((row): row is NonNullable<typeof row> => !!row)
    .map(row => ({
      tag: row.tag as string,
      mediaCount: row.media_count as number,
      avgLikes: Number(row.avg_likes),
      avgComments: Number(row.avg_comments),
      topPosts: (row.top_posts as HashtagTopPost[]) ?? [],
      fetchedAt: row.fetched_at as string,
    }))
    .sort((a, b) => b.avgLikes - a.avgLikes);
}
