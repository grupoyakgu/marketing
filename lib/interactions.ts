import { supabase } from './supabase';
import { queueFetchRequest, countOpenFetchRequests, countFailuresToday } from './interaction-fetch-queue';

export type InteractionPlatform = 'linkedin' | 'facebook' | 'instagram';
export const INTERACTION_PLATFORMS: InteractionPlatform[] = ['linkedin', 'facebook', 'instagram'];

// A screenshot alone never exposes a post's real permalink — a feed shows a
// caption and a username, not the href behind it — so discovery (see
// browse_social_search in marketing-agent.ts) extracts every link on the
// page and filters it down to ones shaped like an actual post URL using
// these patterns, rather than a profile/hashtag/homepage link.
const POST_URL_PATTERNS: Record<InteractionPlatform, RegExp> = {
  linkedin: /linkedin\.com\/(posts|feed\/update|pulse)\//i,
  instagram: /instagram\.com\/(p|reel|tv)\//i,
  facebook: /facebook\.com\/.*(\/(posts|videos|photos)\/|permalink\.php|story_fbid=|\/photo\/)/i,
};

export function looksLikePostUrl(platform: InteractionPlatform, url: string): boolean {
  return POST_URL_PATTERNS[platform].test(url);
}

export interface InteractionTopic {
  id: string;
  topic: string;
  added_by: 'user' | 'pepe';
  created_at: string;
}

export interface InteractionPost {
  id: string;
  platform: InteractionPlatform;
  url: string;
  author: string | null;
  content_preview: string | null;
  topic: string | null;
  likes: number | null;
  comments: number | null;
  shares: number | null;
  status: 'active' | 'done';
  discovered_at: string;
  done_at: string | null;
}

// ─── Topics ─────────────────────────────────────────────────────────────────

export async function listTopics(): Promise<InteractionTopic[]> {
  const { data, error } = await supabase
    .from('interaction_topics')
    .select('*')
    .order('created_at', { ascending: true });
  if (error) throw new Error(error.message);
  return data ?? [];
}

export async function addTopic(topic: string, addedBy: 'user' | 'pepe'): Promise<InteractionTopic> {
  const { data, error } = await supabase
    .from('interaction_topics')
    .insert({ topic: topic.trim(), added_by: addedBy })
    .select()
    .single();
  if (error) throw new Error(error.message);
  return data;
}

export async function removeTopic(id: string): Promise<void> {
  const { error } = await supabase.from('interaction_topics').delete().eq('id', id);
  if (error) throw new Error(error.message);
}

// ─── Settings ───────────────────────────────────────────────────────────────
//
// Per platform, not a single shared count — discovery success rate differs a
// lot by platform (login walls, how much content is actually reachable), so
// the target is tuned per platform rather than one number for all three.

export async function getDailyCount(platform: InteractionPlatform): Promise<number> {
  const { data, error } = await supabase
    .from('interaction_platform_settings')
    .select('daily_count')
    .eq('platform', platform)
    .single();
  if (error) throw new Error(error.message);
  return data.daily_count;
}

export async function getDailyCounts(): Promise<Record<InteractionPlatform, number>> {
  const { data, error } = await supabase
    .from('interaction_platform_settings')
    .select('platform, daily_count');
  if (error) throw new Error(error.message);
  const result = {} as Record<InteractionPlatform, number>;
  for (const row of data ?? []) result[row.platform as InteractionPlatform] = row.daily_count;
  return result;
}

export async function setDailyCount(platform: InteractionPlatform, count: number): Promise<number> {
  const { data, error } = await supabase
    .from('interaction_platform_settings')
    .update({ daily_count: count, updated_at: new Date().toISOString() })
    .eq('platform', platform)
    .select('daily_count')
    .single();
  if (error) throw new Error(error.message);
  return data.daily_count;
}

// ─── Posts ──────────────────────────────────────────────────────────────────

export async function listPosts(opts: {
  platform?: InteractionPlatform;
  includeDone?: boolean;
} = {}): Promise<InteractionPost[]> {
  let query = supabase.from('interaction_posts').select('*').order('discovered_at', { ascending: false });
  if (opts.platform) query = query.eq('platform', opts.platform);
  if (!opts.includeDone) query = query.eq('status', 'active');
  const { data, error } = await query;
  if (error) throw new Error(error.message);
  return data ?? [];
}

/** Recent URLs already tracked for a platform (active + done) — passed to
 * Pepe when he's asked to find another one, so he doesn't suggest a
 * duplicate. */
export async function listRecentUrls(platform: InteractionPlatform, limit = 20): Promise<string[]> {
  const { data, error } = await supabase
    .from('interaction_posts')
    .select('url')
    .eq('platform', platform)
    .order('discovered_at', { ascending: false })
    .limit(limit);
  if (error) throw new Error(error.message);
  return (data ?? []).map(row => row.url);
}

export interface NewInteractionPost {
  platform: InteractionPlatform;
  url: string;
  author?: string | null;
  content_preview?: string | null;
  topic?: string | null;
  likes?: number | null;
  comments?: number | null;
  shares?: number | null;
}

/** The only insert path into interaction_posts. Goes through the
 * add_interaction_post_capped DB function rather than a plain insert so the
 * platform's daily_count is a hard ceiling even under races — e.g. two
 * queueBackfillIfNeeded calls (from a delete and an overlapping daily-refresh
 * cron) each queueing a fetch request for what looks like the same open
 * slot. Throws with a message starting "DAILY_LIMIT_REACHED" when the
 * platform is already at (or, from such a race, over) its target; callers
 * that fulfill queued fetch requests (see process-interaction-fetches.ts)
 * treat that as an expected no-op rather than a real failure. */
export async function addPost(fields: NewInteractionPost): Promise<InteractionPost> {
  const { data, error } = await supabase.rpc('add_interaction_post_capped', {
    p_platform: fields.platform,
    p_url: fields.url,
    p_author: fields.author ?? null,
    p_content_preview: fields.content_preview ?? null,
    p_topic: fields.topic ?? null,
    p_likes: fields.likes ?? null,
    p_comments: fields.comments ?? null,
    p_shares: fields.shares ?? null,
  });
  if (error) throw new Error(error.message);
  return data;
}

export async function markPostDone(id: string): Promise<InteractionPost> {
  const { data, error } = await supabase
    .from('interaction_posts')
    .update({ status: 'done', done_at: new Date().toISOString() })
    .eq('id', id)
    .select()
    .single();
  if (error) throw new Error(error.message);
  return data;
}

/** Removing a post is the only thing that opens up its platform's slot again
 * (marking one "done" doesn't — it's still counted, just hidden by default),
 * so this is the one place that triggers a backfill. */
export async function deletePost(id: string): Promise<void> {
  const { data: post, error: fetchError } = await supabase
    .from('interaction_posts')
    .select('platform')
    .eq('id', id)
    .single();
  if (fetchError) throw new Error(fetchError.message);

  const { error } = await supabase.from('interaction_posts').delete().eq('id', id);
  if (error) throw new Error(error.message);

  await queueBackfillIfNeeded(post.platform as InteractionPlatform);
}

export async function countPosts(platform: InteractionPlatform): Promise<number> {
  const { count, error } = await supabase
    .from('interaction_posts')
    .select('id', { count: 'exact', head: true })
    .eq('platform', platform);
  if (error) throw new Error(error.message);
  return count ?? 0;
}

// ─── Backfill ───────────────────────────────────────────────────────────────

// Once a platform has failed this many discovery attempts in a single UTC
// day (login wall down, page layout changed, etc.), stop queueing more for
// it until the next day rather than retrying — and re-notifying on Telegram
// — indefinitely. queueBackfillIfNeeded is re-evaluated fresh each day (the
// refresh-interactions cron and any delete on that platform), so the platform
// automatically gets another round of attempts tomorrow.
const MAX_DAILY_FETCH_FAILURES = 3;

/** Tops a platform's queued+existing (active or done) post count up to the
 * daily target by queueing one fetch request per missing slot. Open (pending
 * or processing) requests are counted too, so calling this repeatedly before
 * earlier requests finish never over-queues. Stops early if the platform has
 * already hit its daily failure cap. */
export async function queueBackfillIfNeeded(platform: InteractionPlatform): Promise<number> {
  const [target, existing, open, failuresToday] = await Promise.all([
    getDailyCount(platform),
    countPosts(platform),
    countOpenFetchRequests(platform),
    countFailuresToday(platform),
  ]);

  if (failuresToday >= MAX_DAILY_FETCH_FAILURES) return 0;

  const shortfall = target - existing - open;
  for (let i = 0; i < shortfall; i++) {
    await queueFetchRequest(platform);
  }
  return Math.max(shortfall, 0);
}

/** Daily top-up across every platform — the initial bootstrap (nothing
 * discovered yet) and general safety net, distinct from the immediate
 * per-delete backfill above. */
export async function refreshAllPlatforms(): Promise<Record<InteractionPlatform, number>> {
  const result = {} as Record<InteractionPlatform, number>;
  for (const platform of INTERACTION_PLATFORMS) {
    result[platform] = await queueBackfillIfNeeded(platform);
  }
  return result;
}
