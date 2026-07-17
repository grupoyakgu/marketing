const GRAPH_API = 'https://graph.facebook.com/v19.0';

export interface MetaPostResult {
  success: boolean;
  postId?: string;
  url?: string;
  error?: string;
}

async function getPageToken(): Promise<string> {
  return process.env.INSTAGRAM_PAGE_ACCESS_TOKEN!;
}

export async function postToFacebook(message: string, imageUrl?: string): Promise<MetaPostResult> {
  const token = await getPageToken();
  const pageId = process.env.FACEBOOK_PAGE_ID!;

  if (imageUrl) {
    // Post as photo with caption
    const res = await fetch(`${GRAPH_API}/${pageId}/photos`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ url: imageUrl, caption: message, access_token: token }),
    });
    const json = await res.json();
    if (!res.ok) return { success: false, error: json.error?.message ?? 'Unknown error' };
    const postId: string = json.post_id ?? json.id;
    return { success: true, postId, url: `https://www.facebook.com/${postId.replace('_', '/posts/')}` };
  }

  // Text-only post
  const res = await fetch(`${GRAPH_API}/${pageId}/feed`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ message, access_token: token }),
  });
  const json = await res.json();
  if (!res.ok) return { success: false, error: json.error?.message ?? 'Unknown error' };
  const postId: string = json.id;
  return { success: true, postId, url: `https://www.facebook.com/${postId.replace('_', '/posts/')}` };
}

export async function postToInstagram(caption: string, imageUrl: string): Promise<MetaPostResult> {
  const token = await getPageToken();
  const igAccountId = process.env.INSTAGRAM_BUSINESS_ACCOUNT_ID!;

  const containerRes = await fetch(`${GRAPH_API}/${igAccountId}/media`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ image_url: imageUrl, caption, access_token: token }),
  });
  const container = await containerRes.json();
  if (!containerRes.ok) return { success: false, error: container.error?.message ?? 'Failed to create media container' };

  const publishRes = await fetch(`${GRAPH_API}/${igAccountId}/media_publish`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ creation_id: container.id, access_token: token }),
  });
  const published = await publishRes.json();
  if (!publishRes.ok) return { success: false, error: published.error?.message ?? 'Failed to publish media' };

  return { success: true, postId: published.id, url: `https://www.instagram.com/p/${published.id}/` };
}

export async function getInstagramInsights(): Promise<Record<string, unknown> | null> {
  const token = await getPageToken();
  const igAccountId = process.env.INSTAGRAM_BUSINESS_ACCOUNT_ID!;
  const res = await fetch(
    `${GRAPH_API}/${igAccountId}?fields=followers_count,media_count,profile_views&access_token=${token}`
  );
  if (!res.ok) return null;
  return res.json();
}
