import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import {
  getFacebookPostEngagement,
  getInstagramPostEngagement,
  getLinkedInPostEngagement,
  getAllAccountStats,
  type PostEngagement,
} from '@/lib/engagement';
import { getMostRecentPepeChatId } from '@/lib/marketing-plan';
import { chat } from '@/lib/marketing-agent';

export const dynamic = 'force-dynamic';
export const maxDuration = 300;

async function sendTelegramMessage(chatId: number, text: string) {
  const token = process.env.TELEGRAM_BOT_TOKEN!;
  await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ chat_id: chatId, text, parse_mode: 'Markdown' }),
  });
}

async function getRecentPostIds(): Promise<
  { platform: 'linkedin' | 'instagram' | 'facebook'; platform_post_id: string; content: string }[]
> {
  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );
  const sevenDaysAgo = new Date();
  sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);

  const [planned, tracked] = await Promise.all([
    supabase
      .from('marketing_plan')
      .select('platform, platform_post_id, content')
      .eq('status', 'posted')
      .gte('scheduled_date', sevenDaysAgo.toISOString().split('T')[0])
      .not('platform_post_id', 'is', null),
    supabase
      .from('tracked_posts')
      .select('platform, platform_post_id')
      .gte('posted_at', sevenDaysAgo.toISOString()),
  ]);

  const rows: { platform: 'linkedin' | 'instagram' | 'facebook'; platform_post_id: string; content: string }[] = [];
  for (const r of planned.data ?? []) {
    if (r.platform_post_id) rows.push(r as typeof rows[number]);
  }
  for (const r of tracked.data ?? []) {
    if (r.platform_post_id) rows.push({ ...r, content: '' } as typeof rows[number]);
  }
  return rows;
}

export async function GET(req: Request) {
  if (
    process.env.CRON_SECRET &&
    req.headers.get('authorization') !== `Bearer ${process.env.CRON_SECRET}`
  ) {
    return new NextResponse('Unauthorized', { status: 401 });
  }

  const chatId = await getMostRecentPepeChatId();
  if (!chatId) return NextResponse.json({ skipped: 'no chat id' });

  // Fetch account stats and post engagement in parallel
  const [postRows, accountStats] = await Promise.all([
    getRecentPostIds(),
    getAllAccountStats(),
  ]);

  const engagements: PostEngagement[] = [];
  for (const row of postRows) {
    try {
      let eng: PostEngagement | null = null;
      if (row.platform === 'facebook') eng = await getFacebookPostEngagement(row.platform_post_id);
      else if (row.platform === 'instagram') eng = await getInstagramPostEngagement(row.platform_post_id);
      else if (row.platform === 'linkedin') eng = await getLinkedInPostEngagement(row.platform_post_id);
      if (eng) engagements.push(eng);
    } catch {}
  }

  // Build raw data message for Pepe to narrate
  const accountLines = accountStats
    .map(s => `${s.platform}: ${s.followers.toLocaleString()} followers`)
    .join('\n');

  const postLines = engagements.length > 0
    ? engagements
        .map(
          (e, i) =>
            `Post ${i + 1} [${e.platform}]\n` +
            `  Likes: ${e.likes} | Comments: ${e.comments} | Shares: ${e.shares}\n` +
            `  Impressions: ${e.impressions} | Reach: ${e.reach}`
        )
        .join('\n\n')
    : 'No post data available for this week.';

  const agentMessage =
    `It's Friday — time for the weekly engagement report. Here is the raw data from all platforms this week. ` +
    `Please write a concise, insightful weekly performance summary for the user. ` +
    `Highlight what worked well, what could improve, and any strategic recommendation for next week. ` +
    `Keep it under 300 words. Write in English.\n\n` +
    `ACCOUNT STATS:\n${accountLines}\n\n` +
    `POST ENGAGEMENT (last 7 days):\n${postLines}`;

  const reply = await chat(chatId, agentMessage);
  await sendTelegramMessage(chatId, reply);

  return NextResponse.json({ ok: true, posts: engagements.length });
}
