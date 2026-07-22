import { supabase } from '@/lib/supabase';

export interface MarketingPost {
  id?: string;
  week_start: string;
  platform: 'linkedin' | 'instagram' | 'facebook';
  scheduled_date: string;
  scheduled_time: string;
  content: string;
  image_note?: string;
  image_url?: string | null;
  status?: string;
  post_url?: string;
  platform_post_id?: string;
}

export async function saveDraftPlan(
  posts: Omit<MarketingPost, 'id' | 'status'>[]
): Promise<MarketingPost[]> {
  const { data, error } = await supabase
    .from('marketing_plan')
    .insert(posts.map(p => ({ ...p, status: 'draft' })))
    .select();
  if (error) throw new Error(error.message);
  return data ?? [];
}

export async function getWeeklyPlan(weekStart: string): Promise<MarketingPost[]> {
  const { data, error } = await supabase
    .from('marketing_plan')
    .select('*')
    .eq('week_start', weekStart)
    .order('scheduled_date')
    .order('scheduled_time');
  if (error) throw new Error(error.message);
  return data ?? [];
}

export async function getPostById(postId: string): Promise<MarketingPost | null> {
  const { data, error } = await supabase
    .from('marketing_plan')
    .select('*')
    .eq('id', postId)
    .maybeSingle();
  if (error) throw new Error(error.message);
  return data;
}

export async function approveAllDrafts(weekStart: string): Promise<void> {
  const { error } = await supabase
    .from('marketing_plan')
    .update({ status: 'approved' })
    .eq('week_start', weekStart)
    .eq('status', 'draft');
  if (error) throw new Error(error.message);
}

export async function approvePost(postId: string): Promise<void> {
  const { error } = await supabase
    .from('marketing_plan')
    .update({ status: 'approved' })
    .eq('id', postId);
  if (error) throw new Error(error.message);
}

export async function deletePost(postId: string): Promise<void> {
  const { data: existing, error: fetchError } = await supabase
    .from('marketing_plan')
    .select('status')
    .eq('id', postId)
    .maybeSingle();
  if (fetchError) throw new Error(fetchError.message);
  if (!existing) throw new Error('Post not found.');
  if (existing.status === 'posted') {
    throw new Error('This post has already been published — it can no longer be deleted, only posts that have not been posted yet.');
  }

  const { error } = await supabase
    .from('marketing_plan')
    .delete()
    .eq('id', postId);
  if (error) throw new Error(error.message);
}

export interface PostUpdate {
  content?: string;
  scheduled_date?: string;
  scheduled_time?: string;
  platform?: 'linkedin' | 'instagram' | 'facebook';
  image_url?: string | null;
}

export async function updatePost(postId: string, fields: PostUpdate): Promise<MarketingPost> {
  const { data: existing, error: fetchError } = await supabase
    .from('marketing_plan')
    .select('status')
    .eq('id', postId)
    .maybeSingle();
  if (fetchError) throw new Error(fetchError.message);
  if (!existing) throw new Error('Post not found.');
  if (existing.status === 'posted') {
    throw new Error('This post has already been published — it can no longer be edited or rescheduled, only posts that have not been posted yet.');
  }

  const { data, error } = await supabase
    .from('marketing_plan')
    .update(fields)
    .eq('id', postId)
    .select()
    .single();
  if (error) throw new Error(error.message);
  return data;
}

export async function getPostsDueNow(): Promise<MarketingPost[]> {
  const now = new Date();
  const spainDate = new Intl.DateTimeFormat('sv-SE', {
    timeZone: 'Europe/Madrid',
  }).format(now);
  const spainHour = parseInt(
    new Intl.DateTimeFormat('en', {
      timeZone: 'Europe/Madrid',
      hour: 'numeric',
      hour12: false,
    }).format(now),
    10
  );
  const hourStr = String(spainHour).padStart(2, '0');

  const { data, error } = await supabase
    .from('marketing_plan')
    .select('*')
    .eq('scheduled_date', spainDate)
    .eq('status', 'approved')
    .gte('scheduled_time', `${hourStr}:00`)
    .lte('scheduled_time', `${hourStr}:59`);
  if (error) throw new Error(error.message);
  return data ?? [];
}

export async function markPostStatus(
  postId: string,
  status: 'posted' | 'failed',
  postUrl?: string,
  platformPostId?: string
): Promise<void> {
  const { error } = await supabase
    .from('marketing_plan')
    .update({
      status,
      ...(postUrl ? { post_url: postUrl } : {}),
      ...(platformPostId ? { platform_post_id: platformPostId } : {}),
    })
    .eq('id', postId);
  if (error) throw new Error(error.message);
}

/** Track a directly-posted post (not via the scheduled cron) so the comment cron can find it. */
export async function trackDirectPost(
  platform: 'linkedin' | 'instagram' | 'facebook',
  platformPostId: string
): Promise<void> {
  await supabase
    .from('tracked_posts')
    .upsert({ platform, platform_post_id: platformPostId });
}

/** Returns all post IDs (from both marketing_plan and tracked_posts) for comment checking. */
export async function getPostedPostsForCommentCheck(): Promise<
  { platform: 'linkedin' | 'instagram' | 'facebook'; platform_post_id: string }[]
> {
  const sevenDaysAgo = new Date();
  sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);
  const cutoffDate = sevenDaysAgo.toISOString().split('T')[0];
  const cutoffTs = sevenDaysAgo.toISOString();

  const [planned, tracked] = await Promise.all([
    supabase
      .from('marketing_plan')
      .select('platform, platform_post_id')
      .eq('status', 'posted')
      .gte('scheduled_date', cutoffDate)
      .not('platform_post_id', 'is', null),
    supabase
      .from('tracked_posts')
      .select('platform, platform_post_id')
      .gte('posted_at', cutoffTs),
  ]);

  const results: { platform: 'linkedin' | 'instagram' | 'facebook'; platform_post_id: string }[] = [];
  for (const row of [...(planned.data ?? []), ...(tracked.data ?? [])]) {
    if (row.platform_post_id) results.push(row as typeof results[number]);
  }
  return results;
}

export async function getMostRecentPepeChatId(): Promise<number | null> {
  const { data } = await supabase
    .from('chat_history')
    .select('chat_id')
    .eq('bot', 'pepe')
    .order('created_at', { ascending: false })
    .limit(1);
  return data?.[0]?.chat_id ?? null;
}

// ─── Dashboard aggregates ──────────────────────────────────────────────────

export interface PostCounts {
  total: number;
  scheduled: number;
  published: number;
  failed: number;
  pending: number;
}

export async function getPostCounts(): Promise<PostCounts> {
  const { data, error } = await supabase.from('marketing_plan').select('status');
  if (error) throw new Error(error.message);
  const rows = data ?? [];
  const counts: PostCounts = { total: rows.length, scheduled: 0, published: 0, failed: 0, pending: 0 };
  for (const r of rows) {
    if (r.status === 'approved') counts.scheduled++;
    else if (r.status === 'posted') counts.published++;
    else if (r.status === 'failed') counts.failed++;
    else if (r.status === 'draft') counts.pending++;
  }
  return counts;
}

export interface PostsByDate {
  date: string;
  count: number;
}

export async function getPostsPublishedByDate(days = 14): Promise<PostsByDate[]> {
  const since = new Date();
  since.setDate(since.getDate() - days);
  const { data, error } = await supabase
    .from('marketing_plan')
    .select('scheduled_date')
    .eq('status', 'posted')
    .gte('scheduled_date', since.toISOString().split('T')[0]);
  if (error) throw new Error(error.message);

  const counts = new Map<string, number>();
  for (const r of data ?? []) {
    counts.set(r.scheduled_date, (counts.get(r.scheduled_date) ?? 0) + 1);
  }
  return Array.from(counts.entries())
    .map(([date, count]) => ({ date, count }))
    .sort((a, b) => a.date.localeCompare(b.date));
}

export function getNextMonday(fromDate?: Date): string {
  const now = fromDate ?? new Date();
  const day = now.getDay();
  const daysUntil = day === 0 ? 1 : day === 1 ? 7 : 8 - day;
  const next = new Date(now);
  next.setDate(now.getDate() + daysUntil);
  return next.toISOString().split('T')[0];
}
