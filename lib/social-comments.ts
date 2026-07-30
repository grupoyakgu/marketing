import { supabase } from '@/lib/supabase';

// The legacy unversioned /v2 socialActions endpoints are blocked for comment
// read/write even with r_organization_social granted — LinkedIn's error
// ("socialActions.GET_ALL.NO_VERSION") indicates this resource now requires
// the versioned /rest API with a LinkedIn-Version header.
// LinkedIn only keeps roughly the last 12 months of versions active, so this
// default needs bumping periodically (bump LINKEDIN_API_VERSION in Vercel env
// vars instead of redeploying if this goes stale again).
const LINKEDIN_REST_API = 'https://api.linkedin.com/rest';
const LINKEDIN_API_VERSION = process.env.LINKEDIN_API_VERSION ?? '202601';
const GRAPH_API = 'https://graph.facebook.com/v19.0';

export interface SocialComment {
  platform: 'linkedin' | 'instagram' | 'facebook';
  commentId: string;
  postId: string;
  authorName: string;
  text: string;
  createdAt: string;
}

function db() {
  return supabase;
}

// ─── Comment reply tracking ──────────────────────────────────────────────

export async function hasReplied(commentId: string): Promise<boolean> {
  const { data } = await db()
    .from('comment_replies')
    .select('comment_id')
    .eq('comment_id', commentId)
    .maybeSingle();
  return !!data;
}

export async function markReplied(commentId: string, platform: string): Promise<void> {
  await db().from('comment_replies').upsert({ comment_id: commentId, platform });
}

// ─── Comment history (display) ────────────────────────────────────────────

export interface CommentLogRow {
  id: string;
  platform: 'linkedin' | 'instagram' | 'facebook';
  commentId: string;
  postId: string;
  authorName: string | null;
  commentText: string;
  commentCreatedAt: string | null;
  replied: boolean;
  replyText: string | null;
  repliedAt: string | null;
  createdAt: string;
}

/** Records newly-seen unreplied comments for the Comments page. Uses
 * ignoreDuplicates so it never clobbers a row a later reply already updated —
 * callers only pass comments that hasReplied() confirmed aren't answered yet. */
export async function recordSeenComments(comments: SocialComment[]): Promise<void> {
  if (comments.length === 0) return;
  const { error } = await db()
    .from('comment_log')
    .upsert(
      comments.map(c => ({
        platform: c.platform,
        comment_id: c.commentId,
        post_id: c.postId,
        author_name: c.authorName,
        comment_text: c.text,
        comment_created_at: c.createdAt,
      })),
      { onConflict: 'platform,comment_id', ignoreDuplicates: true }
    );
  if (error) console.error(`recordSeenComments insert failed: ${error.message}`);
}

export async function recordCommentReply(platform: string, commentId: string, replyText: string): Promise<void> {
  const { error } = await db()
    .from('comment_log')
    .update({ replied: true, reply_text: replyText, replied_at: new Date().toISOString() })
    .eq('platform', platform)
    .eq('comment_id', commentId);
  if (error) console.error(`recordCommentReply update failed: ${error.message}`);
}

export async function getCommentLog(limit = 100): Promise<CommentLogRow[]> {
  const { data, error } = await db()
    .from('comment_log')
    .select('*')
    .order('created_at', { ascending: false })
    .limit(limit);
  if (error) throw new Error(error.message);
  return (data ?? []).map(r => ({
    id: r.id,
    platform: r.platform,
    commentId: r.comment_id,
    postId: r.post_id,
    authorName: r.author_name,
    commentText: r.comment_text,
    commentCreatedAt: r.comment_created_at,
    replied: r.replied,
    replyText: r.reply_text,
    repliedAt: r.replied_at,
    createdAt: r.created_at,
  }));
}

// ─── Comment check status ──────────────────────────────────────────────────

export interface CommentCheckStatus {
  checkedAt: string | null;
  commentsHandled: number | null;
  skipped: string | null;
}

export async function getCommentCheckStatus(): Promise<CommentCheckStatus> {
  const { data } = await db()
    .from('comment_check_status')
    .select('checked_at, comments_handled, skipped')
    .eq('id', 'singleton')
    .maybeSingle();
  return {
    checkedAt: data?.checked_at ?? null,
    commentsHandled: data?.comments_handled ?? null,
    skipped: data?.skipped ?? null,
  };
}

export async function recordCommentCheckStatus(status: {
  commentsHandled: number;
  skipped?: string;
}): Promise<void> {
  const { error } = await db()
    .from('comment_check_status')
    .upsert({
      id: 'singleton',
      checked_at: new Date().toISOString(),
      comments_handled: status.commentsHandled,
      skipped: status.skipped ?? null,
    });
  if (error) console.error(`recordCommentCheckStatus upsert failed: ${error.message}`);
}

// ─── Comment view status (unread notification dot) ─────────────────────────

export async function markCommentsViewed(): Promise<void> {
  const { error } = await db()
    .from('comment_view_status')
    .upsert({ id: 'singleton', viewed_at: new Date().toISOString() });
  if (error) console.error(`markCommentsViewed upsert failed: ${error.message}`);
}

/** True if any comment was recorded (comment-check found it) after the user
 * last opened the /comments page — drives the header notification dot. */
export async function hasUnviewedComments(): Promise<boolean> {
  const [{ data: latest }, { data: viewStatus }] = await Promise.all([
    db().from('comment_log').select('created_at').order('created_at', { ascending: false }).limit(1).maybeSingle(),
    db().from('comment_view_status').select('viewed_at').eq('id', 'singleton').maybeSingle(),
  ]);
  if (!latest?.created_at) return false;
  if (!viewStatus?.viewed_at) return true;
  return new Date(latest.created_at).getTime() > new Date(viewStatus.viewed_at).getTime();
}

// ─── Fetch comments ────────────────────────────────────────────────────────

// Reading comments needs the Community Management API's read scope (same
// gap as getLinkedInPostEngagement in lib/engagement.ts) — production logs
// showed the posting-scoped token 403ing here (partnerApiSocialActions.GET_ALL)
// even though it can post/reply fine, so this uses the separate read token
// while postLinkedInComment/replyToLinkedInComment below keep the write one.
export async function getLinkedInComments(postUrn: string): Promise<SocialComment[]> {
  const token = process.env.LINKEDIN_ACCESS_TOKEN_COMM;
  if (!token) return [];
  const res = await fetch(
    `${LINKEDIN_REST_API}/socialActions/${encodeURIComponent(postUrn)}/comments?count=20`,
    {
      headers: {
        Authorization: `Bearer ${token}`,
        'X-Restli-Protocol-Version': '2.0.0',
        'LinkedIn-Version': LINKEDIN_API_VERSION,
      },
    }
  );
  if (!res.ok) {
    console.error(`LinkedIn getComments failed for ${postUrn}: ${res.status} ${await res.text()}`);
    return [];
  }
  const json = await res.json();
  return (json.elements ?? [])
    .map((e: Record<string, unknown>) => {
      // The compound comment URN ("$URN") is what LinkedIn's reply API needs as
      // `parentComment`; fall back to building it from the raw numeric `id` when
      // the API omits `$URN`, and never fabricate an id — a fake/empty commentId
      // would collide across comments in the reply-tracking table and silently
      // block replies to every future comment once one fake id is marked replied.
      const commentId = (e['$URN'] as string) || (e.id ? `urn:li:comment:(${postUrn},${e.id})` : '');
      return {
        platform: 'linkedin' as const,
        commentId,
        postId: postUrn,
        authorName: (e.actor as string) ?? 'LinkedIn user',
        text: ((e.message as Record<string, string>)?.text) ?? '',
        createdAt: new Date((e.created as Record<string, number>)?.time ?? Date.now()).toISOString(),
      };
    })
    .filter((c: SocialComment) => c.commentId);
}

export async function getFacebookComments(postId: string): Promise<SocialComment[]> {
  const token = process.env.INSTAGRAM_PAGE_ACCESS_TOKEN;
  if (!token) return [];
  const res = await fetch(
    `${GRAPH_API}/${postId}/comments?fields=id,message,from,created_time&access_token=${token}`
  );
  if (!res.ok) return [];
  const json = await res.json();
  return (json.data ?? []).map((c: Record<string, unknown>) => ({
    platform: 'facebook' as const,
    commentId: c.id as string,
    postId,
    authorName: ((c.from as Record<string, string>)?.name) ?? 'Facebook user',
    text: (c.message as string) ?? '',
    createdAt: (c.created_time as string) ?? new Date().toISOString(),
  }));
}

export async function getInstagramComments(mediaId: string): Promise<SocialComment[]> {
  const token = process.env.INSTAGRAM_PAGE_ACCESS_TOKEN;
  if (!token) return [];
  const res = await fetch(
    `${GRAPH_API}/${mediaId}/comments?fields=id,text,username,timestamp&access_token=${token}`
  );
  if (!res.ok) return [];
  const json = await res.json();
  return (json.data ?? []).map((c: Record<string, unknown>) => ({
    platform: 'instagram' as const,
    commentId: c.id as string,
    postId: mediaId,
    authorName: (c.username as string) ?? 'Instagram user',
    text: (c.text as string) ?? '',
    createdAt: (c.timestamp as string) ?? new Date().toISOString(),
  }));
}

export interface CommentPostResult {
  success: boolean;
  /** ID of the comment/reply we just created — used to mark it as already-handled so it's never mistaken for a new incoming comment. */
  commentId?: string;
}

// ─── Post top-level comment (thank-you / shoutout) ────────────────────────────

// Creating/replying to comments needs the Community Management API's
// partnerApiSocialActions.CREATE permission (the posting-scoped token 403s
// here — it can only create top-level UGC posts, not comments). Separately,
// the request body itself was also missing `object` (the URN of the post
// being commented on) — LinkedIn rejects the request outright with a 422
// ("/object field is required") without ever posting anything, which is why
// this kept silently failing even after the token was fixed.
export async function postLinkedInComment(postUrn: string, text: string): Promise<CommentPostResult> {
  const token = process.env.LINKEDIN_ACCESS_TOKEN_COMM;
  const authorId = process.env.LINKEDIN_AUTHOR_ID_COMM;
  if (!token || !authorId) return { success: false };
  const authorUrn = authorId.startsWith('urn:li:') ? authorId : `urn:li:organization:${authorId}`;
  const res = await fetch(
    `${LINKEDIN_REST_API}/socialActions/${encodeURIComponent(postUrn)}/comments`,
    {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
        'X-Restli-Protocol-Version': '2.0.0',
        'LinkedIn-Version': LINKEDIN_API_VERSION,
      },
      body: JSON.stringify({ actor: authorUrn, object: postUrn, message: { text } }),
    }
  );
  if (!res.ok) {
    console.error(`LinkedIn postComment failed for ${postUrn}: ${res.status} ${await res.text()}`);
    return { success: false };
  }
  return { success: true, commentId: await extractLinkedInCreatedId(res) };
}

export async function postFacebookComment(postId: string, text: string): Promise<CommentPostResult> {
  const token = process.env.INSTAGRAM_PAGE_ACCESS_TOKEN;
  if (!token) return { success: false };
  const res = await fetch(`${GRAPH_API}/${postId}/comments`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ message: text, access_token: token }),
  });
  if (!res.ok) return { success: false };
  const json = await res.json();
  return { success: true, commentId: json?.id ? String(json.id) : undefined };
}

export async function postInstagramComment(mediaId: string, text: string): Promise<CommentPostResult> {
  const token = process.env.INSTAGRAM_PAGE_ACCESS_TOKEN;
  if (!token) return { success: false };
  const res = await fetch(`${GRAPH_API}/${mediaId}/comments`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ message: text, access_token: token }),
  });
  if (!res.ok) return { success: false };
  const json = await res.json();
  return { success: true, commentId: json?.id ? String(json.id) : undefined };
}

// ─── Reply to comment ─────────────────────────────────────────────────────

async function extractLinkedInCreatedId(res: Response): Promise<string | undefined> {
  const headerId = res.headers.get('x-restli-id');
  if (headerId) return headerId;
  try {
    const body = await res.json();
    return body?.id ? String(body.id) : undefined;
  } catch {
    return undefined;
  }
}

// Same permission gap and missing-`object` bug as postLinkedInComment above.
export async function replyToLinkedInComment(
  postUrn: string,
  commentUrn: string,
  text: string
): Promise<CommentPostResult> {
  const token = process.env.LINKEDIN_ACCESS_TOKEN_COMM;
  const authorId = process.env.LINKEDIN_AUTHOR_ID_COMM;
  if (!token || !authorId) return { success: false };
  const authorUrn = authorId.startsWith('urn:li:') ? authorId : `urn:li:organization:${authorId}`;
  const res = await fetch(
    `${LINKEDIN_REST_API}/socialActions/${encodeURIComponent(postUrn)}/comments`,
    {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
        'X-Restli-Protocol-Version': '2.0.0',
        'LinkedIn-Version': LINKEDIN_API_VERSION,
      },
      body: JSON.stringify({ actor: authorUrn, object: postUrn, message: { text }, parentComment: commentUrn }),
    }
  );
  if (!res.ok) {
    console.error(`LinkedIn replyToComment failed for ${postUrn}/${commentUrn}: ${res.status} ${await res.text()}`);
    return { success: false };
  }
  return { success: true, commentId: await extractLinkedInCreatedId(res) };
}

export async function replyToFacebookComment(commentId: string, text: string): Promise<CommentPostResult> {
  const token = process.env.INSTAGRAM_PAGE_ACCESS_TOKEN;
  if (!token) return { success: false };
  const res = await fetch(`${GRAPH_API}/${commentId}/comments`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ message: text, access_token: token }),
  });
  if (!res.ok) return { success: false };
  const json = await res.json();
  return { success: true, commentId: json?.id ? String(json.id) : undefined };
}

export async function replyToInstagramComment(commentId: string, text: string): Promise<CommentPostResult> {
  const token = process.env.INSTAGRAM_PAGE_ACCESS_TOKEN;
  if (!token) return { success: false };
  const res = await fetch(`${GRAPH_API}/${commentId}/replies`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ message: text, access_token: token }),
  });
  if (!res.ok) return { success: false };
  const json = await res.json();
  return { success: true, commentId: json?.id ? String(json.id) : undefined };
}
