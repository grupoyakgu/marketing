import { NextResponse } from 'next/server';
import { getPostedPostsForCommentCheck, getMostRecentPepeChatId } from '@/lib/marketing-plan';
import {
  getLinkedInComments,
  getFacebookComments,
  getInstagramComments,
  hasReplied,
  type SocialComment,
} from '@/lib/social-comments';
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

  const newComments: SocialComment[] = [];

  for (const post of posts) {
    const postId = post.platform_post_id;
    let comments: SocialComment[] = [];

    try {
      if (post.platform === 'linkedin') {
        comments = await getLinkedInComments(postId);
      } else if (post.platform === 'facebook') {
        comments = await getFacebookComments(postId);
      } else if (post.platform === 'instagram') {
        comments = await getInstagramComments(postId);
      }
    } catch {}

    for (const comment of comments) {
      if (comment.text && !(await hasReplied(comment.commentId))) {
        newComments.push(comment);
      }
    }
  }

  if (newComments.length === 0) {
    return NextResponse.json({ skipped: 'no new comments' });
  }

  const commentList = newComments
    .map(
      (c, i) =>
        `COMMENT ${i + 1}\nPlatform: ${c.platform}\nComment ID: ${c.commentId}\nPost ID: ${c.postId}\nFrom: ${c.authorName}\nText: "${c.text}"`
    )
    .join('\n\n');

  const agentMessage =
    `You have ${newComments.length} new comment(s) on your recent posts that need replies. ` +
    `Please draft a warm, professional reply for each one in the same language as the comment (Spanish for Spanish, English for English). ` +
    `Use the reply_to_comment tool to post each reply immediately.\n\n${commentList}`;

  const reply = await chat(chatId, agentMessage);
  await sendTelegramMessage(chatId, reply);

  return NextResponse.json({ handled: newComments.length });
}
