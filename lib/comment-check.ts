import { getPostedPostsForCommentCheck, getMostRecentPepeChatId } from '@/lib/marketing-plan';
import {
  getLinkedInComments,
  getFacebookComments,
  getInstagramComments,
  hasReplied,
  recordSeenComments,
  recordCommentCheckStatus,
  getCommentLog,
  type SocialComment,
} from '@/lib/social-comments';
import { chat } from '@/lib/marketing-agent';

async function sendTelegramMessage(chatId: number, text: string) {
  const token = process.env.TELEGRAM_BOT_TOKEN!;
  await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ chat_id: chatId, text, parse_mode: 'Markdown' }),
  });
}

export interface CommentCheckResult {
  comments: number;
  skipped?: string;
}

/** Records the run outcome (for the "last checked" display) and returns it,
 * so every exit point — including the early skips — leaves a status behind. */
async function finish(result: CommentCheckResult): Promise<CommentCheckResult> {
  await recordCommentCheckStatus({
    commentsHandled: result.comments,
    skipped: result.skipped,
  });
  return result;
}

/** Fetches comments across all platforms and has Pepe reply to new ones,
 * notifying the user on Telegram. Only reacts to actual incoming comments —
 * no longer reacts to like counts (previously: an automatic thank-you
 * comment and a "shoutout" follow-up post once a post crossed a like
 * threshold), per explicit request to only reply when someone actually
 * comments. Shared by the daily cron (/api/cron/check-comments) and the
 * manual "Check now" action in Settings — same work, two triggers, same as
 * the dashboard-refresh split. */
export async function runCommentCheck(): Promise<CommentCheckResult> {
  const chatId = await getMostRecentPepeChatId();
  if (!chatId) return finish({ comments: 0, skipped: 'no chat id' });

  const posts = await getPostedPostsForCommentCheck();
  if (posts.length === 0) return finish({ comments: 0, skipped: 'no posted posts' });

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

  await recordSeenComments(newComments);

  // ── 2. Handle comments via Pepe ──────────────────────────────────────────
  if (newComments.length > 0) {
    const commentList = newComments
      .map((c, i) =>
        `COMMENT ${i + 1}\nPlatform: ${c.platform}\nComment ID: ${c.commentId}\nPost ID: ${c.postId}\nFrom: ${c.authorName}\nText: "${c.text}"`
      )
      .join('\n\n');

    // Give Pepe concrete recent replies to avoid repeating, not just an
    // instruction to "vary phrasing" in the abstract — chat_history alone
    // isn't reliable for this since it's capped and shared with unrelated
    // conversation turns.
    const recentLog = await getCommentLog(30);
    const recentReplies = recentLog
      .filter(r => r.replied && r.replyText)
      .slice(0, 6)
      .map(r => r.replyText as string);
    const avoidBlock =
      recentReplies.length > 0
        ? `\n\nReplies you've already sent recently — do NOT reuse this wording, opening line, or structure:\n${recentReplies.map((t, i) => `${i + 1}. "${t}"`).join('\n')}`
        : '';

    const reply = await chat(
      chatId,
      `You have ${newComments.length} new comment(s) on your recent posts. ` +
      `Draft a warm, professional reply for each one in the same language as the comment. ` +
      `Each reply must be genuinely different from the others — vary the opening line, phrasing, ` +
      `and structure, and respond to what that specific commenter actually said rather than a ` +
      `generic template.${avoidBlock}\n\n` +
      `Use the reply_to_comment tool to post each reply immediately.\n\n${commentList}`
    );
    await sendTelegramMessage(chatId, reply);
  }

  return finish({ comments: newComments.length });
}
