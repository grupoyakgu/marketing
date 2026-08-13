import { supabase } from '@/lib/supabase';
import { hasActivePaidCampaigns } from '@/lib/meta-ads';

export interface MarketingPost {
  id?: string;
  week_start: string;
  platform: 'linkedin' | 'instagram' | 'facebook';
  scheduled_date: string;
  scheduled_time: string;
  content: string;
  image_note?: string;
  image_url?: string | null;
  image_urls?: string[] | null;
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

/** All posts (any status, any platform) whose scheduled_date falls in [dateFrom, dateTo ?? dateFrom] — unlike getWeeklyPlan, not tied to a Monday-aligned week_start, so a single arbitrary date or an arbitrary range both work. */
export async function getPlanByDateRange(dateFrom: string, dateTo?: string): Promise<MarketingPost[]> {
  const { data, error } = await supabase
    .from('marketing_plan')
    .select('*')
    .gte('scheduled_date', dateFrom)
    .lte('scheduled_date', dateTo ?? dateFrom)
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
  image_urls?: string[] | null;
}

/** Monday (UTC calendar date) of the week containing the given YYYY-MM-DD
 * date — dates in this table are plain calendar dates with no time
 * component, so this stays in UTC throughout rather than drifting with the
 * server's local timezone. */
export function mondayOf(dateStr: string): string {
  const d = new Date(dateStr + 'T00:00:00Z');
  const day = d.getUTCDay();
  const diff = day === 0 ? -6 : 1 - day; // Sunday (0) rolls back to the Monday before it
  d.setUTCDate(d.getUTCDate() + diff);
  return d.toISOString().split('T')[0];
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

  // week_start drives the Planner page's weekly query (getWeeklyPlan) while
  // the page itself groups cards by scheduled_date — the two columns must
  // stay in sync or a rescheduled post silently disappears from the
  // Planner (still fires from getPostsDueNow, which reads scheduled_date
  // directly, so it can post without ever being visible there).
  const updateFields: PostUpdate & { week_start?: string } = { ...fields };
  if (fields.scheduled_date) updateFields.week_start = mondayOf(fields.scheduled_date);

  const { data, error } = await supabase
    .from('marketing_plan')
    .update(updateFields)
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
  // Previously matched only the CURRENT hour bucket (scheduled_time between
  // HH:00 and HH:59) — a post that became 'approved' after its hour's single
  // cron tick had already passed (e.g. approved a few minutes late, or the
  // matching tick was missed for any reason) fell out of every future tick's
  // window forever, since each run only ever checks the hour it's currently
  // in, never "anything still overdue." Comparing against the exact current
  // time instead of a hard hour boundary means a post that's due — whether
  // that's this minute or hours ago — gets picked up on the very next tick,
  // and once it's posted/failed the status filter below excludes it from
  // ever being reconsidered, so this can't cause a duplicate post.
  const parts = new Intl.DateTimeFormat('en-GB', {
    timeZone: 'Europe/Madrid',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false,
  }).formatToParts(now);
  const part = (type: string) => parts.find(p => p.type === type)?.value ?? '00';
  const spainTime = `${part('hour')}:${part('minute')}:${part('second')}`;

  const { data, error } = await supabase
    .from('marketing_plan')
    .select('*')
    .eq('scheduled_date', spainDate)
    .eq('status', 'approved')
    .lte('scheduled_time', spainTime);
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

/** Records a post that went out directly (outside the Planner's draft ->
 * approved -> posted flow, e.g. a HeyGen video) as an already-posted
 * marketing_plan row, so the Planner stays a complete record of everything
 * published rather than only what was scheduled through it. trackDirectPost
 * above writes to tracked_posts, which exists purely so the comment cron can
 * find the post -- it isn't queried anywhere the Planner UI reads from, so a
 * direct post was otherwise invisible there. */
export async function recordDirectPostInPlan(fields: {
  platform: 'linkedin' | 'instagram' | 'facebook';
  content: string;
  postUrl?: string;
  platformPostId?: string;
  imageNote?: string;
}): Promise<void> {
  const now = new Date();
  const scheduledDate = now.toISOString().split('T')[0];
  const scheduledTime = now.toISOString().split('T')[1].slice(0, 8);
  const { error } = await supabase.from('marketing_plan').insert({
    week_start: mondayOf(scheduledDate),
    platform: fields.platform,
    scheduled_date: scheduledDate,
    scheduled_time: scheduledTime,
    content: fields.content,
    image_note: fields.imageNote,
    status: 'posted',
    post_url: fields.postUrl,
    platform_post_id: fields.platformPostId,
  });
  if (error) throw new Error(error.message);
}

/** Returns all post IDs (from both marketing_plan and tracked_posts) for comment checking. */
export async function getPostedPostsForCommentCheck(): Promise<
  { platform: 'linkedin' | 'instagram' | 'facebook'; platform_post_id: string }[]
> {
  // Posts still running as paid boosts can keep drawing new comments well
  // past the usual week-old cutoff, so widen the window whenever any paid
  // campaign is currently active — every paid post here is a boost of a post
  // we posted ourselves, so it's already covered by these same two tables,
  // just outside the default lookback.
  const hasPaidCampaigns = await hasActivePaidCampaigns().catch(() => false);
  const lookbackDays = hasPaidCampaigns ? 30 : 7;
  const cutoff = new Date();
  cutoff.setDate(cutoff.getDate() - lookbackDays);
  const cutoffDate = cutoff.toISOString().split('T')[0];
  const cutoffTs = cutoff.toISOString();

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
