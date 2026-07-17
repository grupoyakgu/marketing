import { createClient } from '@supabase/supabase-js';

const LINKEDIN_API = 'https://api.linkedin.com/v2';
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
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );
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

// ─── Milestone tracking ──────────────────────────────────────────────────

export async function hasMilestone(
  platform: string,
  postId: string,
  milestone: string
): Promise<boolean> {
  const { data } = await db()
    .from('post_milestones')
    .select('id')
    .eq('platform', platform)
    .eq('platform_post_id', postId)
    .eq('milestone', milestone)
    .maybeSingle();
  return !!data;
}

export async function recordMilestone(
  platform: string,
  postId: string,
  milestone: string
): Promise<void> {
  await db()
    .from('post_milestones')
    .upsert({ platform, platform_post_id: postId, milestone });
}

// ─── Fetch comments ────────────────────────────────────────────────────────

export async function getLinkedInComments(postUrn: string): Promise<SocialComment[]> {
  const token = process.env.LINKEDIN_ACCESS_TOKEN;
  if (!token) return [];
  const res = await fetch(
    `${LINKEDIN_API}/socialActions/${encodeURIComponent(postUrn)}/comments?count=20`,
    { headers: { Authorization: `Bearer ${token}`, 'X-Restli-Protocol-Version': '2.0.0' } }
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

// ─── Post top-level comment (thank-you / shoutout) ────────────────────────────

export async function postLinkedInComment(postUrn: string, text: string): Promise<boolean> {
  const token = process.env.LINKEDIN_ACCESS_TOKEN;
  const authorId = process.env.LINKEDIN_AUTHOR_ID;
  if (!token || !authorId) return false;
  const authorUrn = authorId.startsWith('urn:li:') ? authorId : `urn:li:organization:${authorId}`;
  const res = await fetch(
    `${LINKEDIN_API}/socialActions/${encodeURIComponent(postUrn)}/comments`,
    {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
        'X-Restli-Protocol-Version': '2.0.0',
      },
      body: JSON.stringify({ actor: authorUrn, message: { text } }),
    }
  );
  if (!res.ok) console.error(`LinkedIn postComment failed for ${postUrn}: ${res.status} ${await res.text()}`);
  return res.ok;
}

export async function postFacebookComment(postId: string, text: string): Promise<boolean> {
  const token = process.env.INSTAGRAM_PAGE_ACCESS_TOKEN;
  if (!token) return false;
  const res = await fetch(`${GRAPH_API}/${postId}/comments`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ message: text, access_token: token }),
  });
  return res.ok;
}

export async function postInstagramComment(mediaId: string, text: string): Promise<boolean> {
  const token = process.env.INSTAGRAM_PAGE_ACCESS_TOKEN;
  if (!token) return false;
  const res = await fetch(`${GRAPH_API}/${mediaId}/comments`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ message: text, access_token: token }),
  });
  return res.ok;
}

// ─── Reply to comment ─────────────────────────────────────────────────────

export async function replyToLinkedInComment(
  postUrn: string,
  commentUrn: string,
  text: string
): Promise<boolean> {
  const token = process.env.LINKEDIN_ACCESS_TOKEN;
  const authorId = process.env.LINKEDIN_AUTHOR_ID;
  if (!token || !authorId) return false;
  const authorUrn = authorId.startsWith('urn:li:') ? authorId : `urn:li:organization:${authorId}`;
  const res = await fetch(
    `${LINKEDIN_API}/socialActions/${encodeURIComponent(postUrn)}/comments`,
    {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
        'X-Restli-Protocol-Version': '2.0.0',
      },
      body: JSON.stringify({ actor: authorUrn, message: { text }, parentComment: commentUrn }),
    }
  );
  if (!res.ok) console.error(`LinkedIn replyToComment failed for ${postUrn}/${commentUrn}: ${res.status} ${await res.text()}`);
  return res.ok;
}

export async function replyToFacebookComment(commentId: string, text: string): Promise<boolean> {
  const token = process.env.INSTAGRAM_PAGE_ACCESS_TOKEN;
  if (!token) return false;
  const res = await fetch(`${GRAPH_API}/${commentId}/comments`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ message: text, access_token: token }),
  });
  return res.ok;
}

export async function replyToInstagramComment(commentId: string, text: string): Promise<boolean> {
  const token = process.env.INSTAGRAM_PAGE_ACCESS_TOKEN;
  if (!token) return false;
  const res = await fetch(`${GRAPH_API}/${commentId}/replies`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ message: text, access_token: token }),
  });
  return res.ok;
}
