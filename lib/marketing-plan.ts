import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

export interface MarketingPost {
  id?: string;
  week_start: string;
  platform: 'linkedin' | 'instagram' | 'facebook';
  scheduled_date: string;
  scheduled_time: string;
  content: string;
  image_note?: string;
  status?: string;
  post_url?: string;
}

export async function ensureMarketingPlanTable(): Promise<void> {
  await supabase.rpc('exec_sql', {
    sql: `
      create table if not exists marketing_plan (
        id uuid primary key default gen_random_uuid(),
        week_start date not null,
        platform text not null check (platform in ('linkedin', 'instagram', 'facebook')),
        scheduled_date date not null,
        scheduled_time time not null,
        content text not null,
        image_note text,
        status text not null default 'draft' check (status in ('draft', 'approved', 'posted', 'failed')),
        post_url text,
        created_at timestamptz not null default now()
      );
      create index if not exists marketing_plan_week_idx on marketing_plan (week_start, status);
      create index if not exists marketing_plan_schedule_idx on marketing_plan (scheduled_date, scheduled_time, status);
      notify pgrst, 'reload schema';
    `
  }).catch(() => {
    // RPC may not exist — table was created manually, that's fine
  });
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
  const { error } = await supabase
    .from('marketing_plan')
    .delete()
    .eq('id', postId);
  if (error) throw new Error(error.message);
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
  postUrl?: string
): Promise<void> {
  const { error } = await supabase
    .from('marketing_plan')
    .update({ status, ...(postUrl ? { post_url: postUrl } : {}) })
    .eq('id', postId);
  if (error) throw new Error(error.message);
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

export function getNextMonday(fromDate?: Date): string {
  const now = fromDate ?? new Date();
  const day = now.getDay();
  const daysUntil = day === 0 ? 1 : day === 1 ? 7 : 8 - day;
  const next = new Date(now);
  next.setDate(now.getDate() + daysUntil);
  return next.toISOString().split('T')[0];
}
