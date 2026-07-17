import { NextResponse } from 'next/server';
import { getPostedPostsForCommentCheck, getMostRecentPepeChatId } from '@/lib/marketing-plan';
import {
  getLinkedInComments,
  getFacebookComments,
  getInstagramComments,
  hasReplied,
  hasMilestone,
  recordMilestone,
  type SocialComment,
} from '@/lib/social-comments';
import {
  getFacebookPostEngagement,
  getInstagramPostEngagement,
  getLinkedInPostEngagement,
} from '@/lib/engagement';
import { chat } from '@/lib/marketing-agent';

export const dynamic = 'force-dynamic';
export const maxDuration = 300;

const THANK_YOU_THRESHOLD = parseInt(process.env.LIKE_THANK_YOU_THRESHOLD ?? '10', 10);
const SHOUTOUT_THRESHOLD = parseInt(process.env.LIKE_SHOUTOUT_THRESHOLD ?? '50', 10);

async function sendTelegramMessage(chatId: number, text: string) {
  const token = process.env.TELEGRAM_BOT_TOKEN!;
  await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ chat_id: chatId, text, parse_mode: 'Markdown' }),
  });
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

  const posts = await getPostedPostsForCommentCheck();
  if (posts.length === 0) return NextResponse.json({ skipped: 'no posted posts' });

  // ── 1. Collect new unreplied comments ────────────────────────────────────────
  const newComments: SocialComment[] = [];

  for (const post of posts) {
    let comments: SocialComment[] = [];
    try {
      if (post.platform === 'linkedin') comments = await getLinkedInComments(post.platform_post_id);
      else if (post.platform === 'facebook') comments = await getFacebookComments(post.platform_post_id);
      else if (post.platform === 'instagram') comments = await getInstagramComments(post.platform_post_id);
    } catch (err) {
      console.error(`Failed to fetch ${post.platform} comments for ${post.platform_post_id}:`, err);
    }
    for (const c of comments) {
      if (c.text && !(await hasReplied(c.commentId))) newComments.push(c);
    }
  }

  // ── 2. Check like milestones ─────────────────────────────────────────────
  const thankYouTasks: { platform: string; postId: string; likes: number }[] = [];
  const shoutoutTasks: { platform: string; postId: string; likes: number }[] = [];

  for (const post of posts) {
    try {
      let eng = null;
      if (post.platform === 'facebook') eng = await getFacebookPostEngagement(post.platform_post_id);
      else if (post.platform === 'instagram') eng = await getInstagramPostEngagement(post.platform_post_id);
      else if (post.platform === 'linkedin') eng = await getLinkedInPostEngagement(post.platform_post_id);
      if (!eng) continue;

      const { likes } = eng;

      if (likes >= SHOUTOUT_THRESHOLD && !(await hasMilestone(post.platform, post.platform_post_id, 'shoutout'))) {
        shoutoutTasks.push({ platform: post.platform, postId: post.platform_post_id, likes });
        await recordMilestone(post.platform, post.platform_post_id, 'shoutout');
      } else if (likes >= THANK_YOU_THRESHOLD && !(await hasMilestone(post.platform, post.platform_post_id, 'thank_you'))) {
        thankYouTasks.push({ platform: post.platform, postId: post.platform_post_id, likes });
        await recordMilestone(post.platform, post.platform_post_id, 'thank_you');
      }
    } catch {}
  }

  // ── 3. Handle comments via Pepe ──────────────────────────────────────────
  if (newComments.length > 0) {
    const commentList = newComments
      .map((c, i) =>
        `COMMENT ${i + 1}\nPlatform: ${c.platform}\nComment ID: ${c.commentId}\nPost ID: ${c.postId}\nFrom: ${c.authorName}\nText: "${c.text}"`
      )
      .join('\n\n');

    const reply = await chat(
      chatId,
      `You have ${newComments.length} new comment(s) on your recent posts. ` +
      `Draft a warm, professional reply for each one in the same language as the comment. ` +
      `Use the reply_to_comment tool to post each reply immediately.\n\n${commentList}`
    );
    await sendTelegramMessage(chatId, reply);
  }

  // ── 4. Handle thank-you comments via Pepe ───────────────────────────────
  for (const task of thankYouTasks) {
    const reply = await chat(
      chatId,
      `Your ${task.platform} post has reached ${task.likes} likes! ` +
      `Please post a warm thank-you comment on this post to acknowledge the support. ` +
      `Write it in Spanish (Spain). Keep it short, warm, and on-brand for Grupo YAKGU / AT Sevilla. ` +
      `Use the post_comment tool with platform="${task.platform}" and post_id="${task.postId}".`
    );
    await sendTelegramMessage(chatId, `👍 *${task.likes} likes on ${task.platform}!*\n\n${reply}`);
  }

  // ── 5. Handle shoutout posts via Pepe ────────────────────────────────
  for (const task of shoutoutTasks) {
    const reply = await chat(
      chatId,
      `Incredible news! Your ${task.platform} post has gone viral with ${task.likes} likes! ` +
      `Please draft a community appreciation follow-up post for ALL platforms (LinkedIn, Instagram, Facebook) ` +
      `to be published in the next available slot. ` +
      `The post should thank the community for the incredible response, build further intrigue about AT Sevilla, ` +
      `and encourage people to stay tuned. Write in Spanish (Spain). ` +
      `Use save_marketing_plan to save the draft — I will review and approve it.`
    );
    await sendTelegramMessage(
      chatId,
      `🔥 *${task.likes} likes on ${task.platform}! Shoutout post drafted:*\n\n${reply}`
    );
  }

  return NextResponse.json({
    comments: newComments.length,
    thankYou: thankYouTasks.length,
    shoutouts: shoutoutTasks.length,
  });
}
