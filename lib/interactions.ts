import { supabase } from './supabase';
import { queueFetchRequest, countOpenFetchRequests } from './interaction-fetch-queue';

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

export async function getDailyCount(): Promise<number> {
  const { data, error } = await supabase
    .from('interaction_settings')
    .select('daily_count')
    .eq('id', 'singleton')
    .single();
  if (error) throw new Error(error.message);
  return data.daily_count;
}

export async function setDailyCount(count: number): Promise<number> {
  const { data, error } = await supabase
    .from('interaction_settings')
    .update({ daily_count: count, updated_at: new Date().toISOString() })
    .eq('id', 'singleton')
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

export async function addPost(fields: NewInteractionPost): Promise<InteractionPost> {
  const { data, error } = await supabase
    .from('interaction_posts')
    .insert({
      platform: fields.platform,
      url: fields.url,
      author: fields.author ?? null,
      content_preview: fields.content_preview ?? null,
      topic: fields.topic ?? null,
      likes: fields.likes ?? null,
      comments: fields.comments ?? null,
      shares: fields.shares ?? null,
    })
    .select()
    .single();
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

/** Tops a platform's queued+existing (active or done) post count up to the
 * daily target by queueing one fetch request per missing slot. Open (pending
 * or processing) requests are counted too, so calling this repeatedly before
 * earlier requests finish never over-queues. */
export async function queueBackfillIfNeeded(platform: InteractionPlatform): Promise<number> {
  const [target, existing, open] = await Promise.all([
    getDailyCount(),
    countPosts(platform),
    countOpenFetchRequests(platform),
  ]);

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
