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

// A published media object's numeric id is NOT the shortcode Instagram's
// public URLs use (confirmed in production: hand-building
// instagram.com/reel/<id>/ from it produced a dead link) -- permalink is the
// Graph API's own real, correct URL for the post. No fallback guessing here
// deliberately -- a caller either gets the real URL or knows the lookup
// failed, rather than silently getting back the same wrong shape this
// replaced. Exported for app/api/admin/backfill-instagram-permalinks/route.ts,
// which re-fetches this for posts that predate this fix and already have a
// bad post_url saved.
export async function fetchInstagramPermalink(mediaId: string): Promise<string | null> {
  const token = await getPageToken();
  const res = await fetch(`${GRAPH_API}/${mediaId}?fields=permalink&access_token=${token}`, { cache: 'no-store' });
  const json = await res.json().catch(() => ({}));
  if (res.ok && typeof json.permalink === 'string') return json.permalink;
  console.error(`[meta-poster] failed to fetch Instagram permalink for ${mediaId}: ${res.status} ${JSON.stringify(json)}`);
  return null;
}

// Used at post time, where some URL is better than none -- falls back to the
// old best-effort guess only if the real lookup fails.
async function getInstagramPermalink(mediaId: string, token: string, fallbackPath: 'p' | 'reel'): Promise<string> {
  const res = await fetch(`${GRAPH_API}/${mediaId}?fields=permalink&access_token=${token}`, { cache: 'no-store' });
  const json = await res.json().catch(() => ({}));
  if (res.ok && typeof json.permalink === 'string') return json.permalink;
  console.error(`[meta-poster] failed to fetch Instagram permalink for ${mediaId}: ${res.status} ${JSON.stringify(json)}`);
  return `https://www.instagram.com/${fallbackPath}/${mediaId}/`;
}

// Uploads a photo unpublished (no feed post created yet) — used both for the
// single-photo path below (post_id comes back directly) and, via
// attached_media, for the multi-photo path where each photo is uploaded this
// way first and then all attached to one feed post together.
async function uploadUnpublishedFacebookPhoto(
  pageId: string,
  imageUrl: string,
  token: string
): Promise<{ id: string } | { error: string }> {
  const res = await fetch(`${GRAPH_API}/${pageId}/photos`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ url: imageUrl, published: false, access_token: token }),
  });
  const json = await res.json();
  if (!res.ok) return { error: json.error?.message ?? 'Failed to upload photo' };
  return { id: json.id };
}

export async function postToFacebook(message: string, imageUrls?: string | string[]): Promise<MetaPostResult> {
  const token = await getPageToken();
  const pageId = process.env.FACEBOOK_PAGE_ID!;
  const urls = (imageUrls ? (Array.isArray(imageUrls) ? imageUrls : [imageUrls]) : []).filter(Boolean);

  if (urls.length > 1) {
    // Multi-photo post: upload each photo unpublished first (in parallel —
    // each is independent, and this can otherwise add up to a lot of
    // sequential round-trips against the cron's tight time budget), then
    // attach all of them to one feed post together.
    const uploads = await Promise.all(urls.map(url => uploadUnpublishedFacebookPhoto(pageId, url, token)));
    const failed = uploads.find(u => 'error' in u) as { error: string } | undefined;
    if (failed) return { success: false, error: failed.error };
    const uploadedIds = uploads.map(u => (u as { id: string }).id);
    const res = await fetch(`${GRAPH_API}/${pageId}/feed`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        message,
        attached_media: uploadedIds.map(id => ({ media_fbid: id })),
        access_token: token,
      }),
    });
    const json = await res.json();
    if (!res.ok) return { success: false, error: json.error?.message ?? 'Unknown error' };
    const postId: string = json.id;
    return { success: true, postId, url: `https://www.facebook.com/${postId.replace('_', '/posts/')}` };
  }

  if (urls.length === 1) {
    // Post as photo with caption
    const res = await fetch(`${GRAPH_API}/${pageId}/photos`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ url: urls[0], caption: message, access_token: token }),
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

// Instagram processes a media container asynchronously after creation (fetching
// the image, transcoding, validating it) — publishing immediately after creating
// it, with no wait, fails with "Media ID is not available" whenever that
// processing hasn't finished yet. Poll status_code until FINISHED (or ERROR)
// before publishing, capped well under the Telegram webhook's 60s budget.
async function waitForContainerReady(containerId: string, token: string): Promise<{ ready: boolean; error?: string }> {
  const maxAttempts = 8;
  const delayMs = 1500;
  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    const res = await fetch(`${GRAPH_API}/${containerId}?fields=status_code&access_token=${token}`, { cache: 'no-store' });
    const json = await res.json();
    if (!res.ok) return { ready: false, error: json.error?.message ?? 'Failed to check media container status' };
    if (json.status_code === 'FINISHED') return { ready: true };
    if (json.status_code === 'ERROR') return { ready: false, error: 'Instagram failed to process the media.' };
    await new Promise(resolve => setTimeout(resolve, delayMs));
  }
  return { ready: false, error: 'Timed out waiting for Instagram to finish processing the media.' };
}

async function createInstagramCarouselItem(
  igAccountId: string,
  imageUrl: string,
  token: string
): Promise<{ id: string } | { error: string }> {
  const res = await fetch(`${GRAPH_API}/${igAccountId}/media`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ image_url: imageUrl, is_carousel_item: true, access_token: token }),
  });
  const json = await res.json();
  if (!res.ok) return { error: json.error?.message ?? 'Failed to create carousel item' };
  return { id: json.id };
}

export async function postToInstagram(caption: string, imageUrls: string | string[]): Promise<MetaPostResult> {
  const token = await getPageToken();
  const igAccountId = process.env.INSTAGRAM_BUSINESS_ACCOUNT_ID!;
  const urls = (Array.isArray(imageUrls) ? imageUrls : [imageUrls]).filter(Boolean);

  if (urls.length === 0) return { success: false, error: 'No image provided.' };
  if (urls.length > 10) return { success: false, error: 'Instagram carousels support at most 10 images.' };

  if (urls.length > 1) {
    // Carousel: create each item as a carousel child and wait for it to
    // finish processing — in parallel, since each is independent and this
    // step alone can otherwise take 10+ sequential rounds of up to ~12s each,
    // easily blowing the auto-publish cron's tight time budget — then wrap
    // them all in a CAROUSEL container and publish that.
    const children = await Promise.all(
      urls.map(async url => {
        const child = await createInstagramCarouselItem(igAccountId, url, token);
        if ('error' in child) return child;
        const readiness = await waitForContainerReady(child.id, token);
        if (!readiness.ready) return { error: readiness.error ?? 'A carousel item was not ready to publish.' };
        return child;
      })
    );
    const failed = children.find(c => 'error' in c) as { error: string } | undefined;
    if (failed) return { success: false, error: failed.error };
    const childIds = children.map(c => (c as { id: string }).id);

    const containerRes = await fetch(`${GRAPH_API}/${igAccountId}/media`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ media_type: 'CAROUSEL', children: childIds.join(','), caption, access_token: token }),
    });
    const container = await containerRes.json();
    if (!containerRes.ok) return { success: false, error: container.error?.message ?? 'Failed to create carousel container' };

    const readiness = await waitForContainerReady(container.id, token);
    if (!readiness.ready) return { success: false, error: readiness.error ?? 'Carousel container was not ready to publish.' };

    const publishRes = await fetch(`${GRAPH_API}/${igAccountId}/media_publish`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ creation_id: container.id, access_token: token }),
    });
    const published = await publishRes.json();
    if (!publishRes.ok) return { success: false, error: published.error?.message ?? 'Failed to publish carousel' };

    return { success: true, postId: published.id, url: await getInstagramPermalink(published.id, token, 'p') };
  }

  const containerRes = await fetch(`${GRAPH_API}/${igAccountId}/media`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ image_url: urls[0], caption, access_token: token }),
  });
  const container = await containerRes.json();
  if (!containerRes.ok) return { success: false, error: container.error?.message ?? 'Failed to create media container' };

  const readiness = await waitForContainerReady(container.id, token);
  if (!readiness.ready) return { success: false, error: readiness.error ?? 'Media container was not ready to publish.' };

  const publishRes = await fetch(`${GRAPH_API}/${igAccountId}/media_publish`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ creation_id: container.id, access_token: token }),
  });
  const published = await publishRes.json();
  if (!publishRes.ok) return { success: false, error: published.error?.message ?? 'Failed to publish media' };

  return { success: true, postId: published.id, url: await getInstagramPermalink(published.id, token, 'p') };
}

// Stories use the same container+publish flow as a feed image post, just
// with media_type: 'STORIES' — Instagram's Content Publishing API doesn't
// support a caption for stories at all (unlike a feed post), so there's no
// text parameter here to pass one.
export async function postInstagramStory(imageUrl: string): Promise<MetaPostResult> {
  const token = await getPageToken();
  const igAccountId = process.env.INSTAGRAM_BUSINESS_ACCOUNT_ID!;

  const containerRes = await fetch(`${GRAPH_API}/${igAccountId}/media`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ image_url: imageUrl, media_type: 'STORIES', access_token: token }),
  });
  const container = await containerRes.json();
  if (!containerRes.ok) return { success: false, error: container.error?.message ?? 'Failed to create story container' };

  const readiness = await waitForContainerReady(container.id, token);
  if (!readiness.ready) return { success: false, error: readiness.error ?? 'Story container was not ready to publish.' };

  const publishRes = await fetch(`${GRAPH_API}/${igAccountId}/media_publish`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ creation_id: container.id, access_token: token }),
  });
  const published = await publishRes.json();
  if (!publishRes.ok) return { success: false, error: published.error?.message ?? 'Failed to publish story' };

  return { success: true, postId: published.id };
}

// Facebook Page Stories require a two-step flow: upload the photo unpublished
// first, then attach it to a story. Meta restricts photo_stories/video_stories
// access heavily for third-party apps — this can fail with a permissions
// error even with everything else configured correctly.
export async function postFacebookStory(imageUrl: string): Promise<MetaPostResult> {
  const token = await getPageToken();
  const pageId = process.env.FACEBOOK_PAGE_ID!;

  const uploadRes = await fetch(`${GRAPH_API}/${pageId}/photos`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ url: imageUrl, published: false, access_token: token }),
  });
  const uploaded = await uploadRes.json();
  if (!uploadRes.ok) return { success: false, error: uploaded.error?.message ?? 'Failed to upload story photo' };

  const storyRes = await fetch(`${GRAPH_API}/${pageId}/photo_stories`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ photo_id: uploaded.id, access_token: token }),
  });
  const story = await storyRes.json();
  if (!storyRes.ok) return { success: false, error: story.error?.message ?? 'Failed to publish Facebook story' };

  return { success: true, postId: story.post_id ?? story.id };
}

// Facebook handles video processing internally after accepting the upload —
// unlike Instagram, there's no container/status_code step to poll; the API
// call itself is the whole operation.
export async function postVideoToFacebook(caption: string, videoUrl: string): Promise<MetaPostResult> {
  const token = await getPageToken();
  const pageId = process.env.FACEBOOK_PAGE_ID!;

  const res = await fetch(`${GRAPH_API}/${pageId}/videos`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ file_url: videoUrl, description: caption, access_token: token }),
  });
  const json = await res.json();
  if (!res.ok) return { success: false, error: json.error?.message ?? 'Unknown error' };
  const postId: string = json.id;
  return { success: true, postId, url: `https://www.facebook.com/${postId}` };
}

// Instagram video containers can take minutes to process — far longer than
// images — so unlike postToInstagram's image flow (which polls inline and
// gives up after ~12s), video posting is split into separate steps a caller
// can resume across multiple checks (e.g. a cron ticking every few minutes)
// instead of blocking one request for however long processing takes.
export async function createInstagramVideoContainer(
  caption: string,
  videoUrl: string
): Promise<{ containerId: string } | { error: string }> {
  const token = await getPageToken();
  const igAccountId = process.env.INSTAGRAM_BUSINESS_ACCOUNT_ID!;

  const res = await fetch(`${GRAPH_API}/${igAccountId}/media`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ video_url: videoUrl, caption, media_type: 'REELS', access_token: token }),
  });
  const json = await res.json();
  if (!res.ok) return { error: json.error?.message ?? 'Failed to create video container' };
  return { containerId: json.id };
}

export interface ContainerCheckResult {
  status: 'FINISHED' | 'IN_PROGRESS' | 'ERROR';
  error?: string;
}

export async function checkInstagramContainer(containerId: string): Promise<ContainerCheckResult> {
  const token = await getPageToken();
  const res = await fetch(`${GRAPH_API}/${containerId}?fields=status_code&access_token=${token}`, { cache: 'no-store' });
  const json = await res.json();
  if (!res.ok) return { status: 'ERROR', error: json.error?.message ?? 'Failed to check container status' };
  if (json.status_code === 'FINISHED') return { status: 'FINISHED' };
  if (json.status_code === 'ERROR') return { status: 'ERROR', error: 'Instagram failed to process the video.' };
  return { status: 'IN_PROGRESS' };
}

export async function publishInstagramContainer(containerId: string): Promise<MetaPostResult> {
  const token = await getPageToken();
  const igAccountId = process.env.INSTAGRAM_BUSINESS_ACCOUNT_ID!;

  const res = await fetch(`${GRAPH_API}/${igAccountId}/media_publish`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ creation_id: containerId, access_token: token }),
  });
  const json = await res.json();
  if (!res.ok) return { success: false, error: json.error?.message ?? 'Failed to publish video' };
  return { success: true, postId: json.id, url: await getInstagramPermalink(json.id, token, 'reel') };
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
