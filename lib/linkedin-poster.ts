const LINKEDIN_API_BASE = 'https://api.linkedin.com/v2';

export interface LinkedInPostResult {
  success: boolean;
  postId?: string;
  url?: string;
  error?: string;
}

type MediaType = 'IMAGE' | 'VIDEO';

export interface MediaUpload {
  data: ArrayBuffer;
  mimeType: string;
  mediaType: MediaType;
}

function buildAuthorUrn(authorId: string): string {
  if (authorId.startsWith('urn:li:')) return authorId;
  if (authorId.startsWith('organization:')) return `urn:li:${authorId}`;
  return `urn:li:member:${authorId}`;
}

async function registerUpload(
  token: string,
  authorUrn: string,
  mediaType: MediaType
): Promise<{ uploadUrl: string; asset: string }> {
  const recipe =
    mediaType === 'IMAGE'
      ? 'urn:li:digitalmediaRecipe:feedshare-image'
      : 'urn:li:digitalmediaRecipe:feedshare-video';

  const res = await fetch(`${LINKEDIN_API_BASE}/assets?action=registerUpload`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
      'X-Restli-Protocol-Version': '2.0.0',
    },
    body: JSON.stringify({
      registerUploadRequest: {
        owner: authorUrn,
        recipes: [recipe],
        serviceRelationships: [
          { identifier: 'urn:li:userGeneratedContent', relationshipType: 'OWNER' },
        ],
      },
    }),
  });

  if (!res.ok) throw new Error(`LinkedIn registerUpload failed ${res.status}: ${await res.text()}`);
  const json = await res.json();
  const uploadUrl: string =
    json.value.uploadMechanism[
      'com.linkedin.digitalmedia.uploading.MediaUploadHttpRequest'
    ].uploadUrl;
  const asset: string = json.value.asset;
  return { uploadUrl, asset };
}

async function uploadMedia(uploadUrl: string, data: ArrayBuffer, mimeType: string): Promise<void> {
  const res = await fetch(uploadUrl, {
    method: 'PUT',
    headers: { 'Content-Type': mimeType },
    body: data,
  });
  if (!res.ok) throw new Error(`LinkedIn media upload failed ${res.status}: ${await res.text()}`);
}

/** The id in x-restli-id (urn:li:ugcPost:X or urn:li:share:X) is NOT the id
 * LinkedIn's own web feed uses for /feed/update/ links -- that's a separate
 * urn:li:activity:Y, with a numeric Y that isn't a fixed offset from X (confirmed
 * from a real production pair: a ugcPost id and its actual working activity id
 * differed by ~83 billion). LinkedIn's Share object carries an `activity` field
 * that names the real one, so this fetches the share back by numeric id and
 * reads it. Best-effort: falls back to the old (possibly-broken) direct-urn link
 * on any failure, so a wrong guess here never makes a working link stop working,
 * it just leaves already-broken links broken -- same failure mode as before this
 * existed.
 */
export async function getLinkedInPermalink(postId: string, token?: string): Promise<string> {
  const resolvedToken = token ?? process.env.LINKEDIN_ACCESS_TOKEN;
  if (!resolvedToken) return `https://www.linkedin.com/feed/update/${postId}/`;
  return getLinkedInPermalinkWithToken(postId, resolvedToken);
}

async function getLinkedInPermalinkWithToken(postId: string, token: string): Promise<string> {
  const fallback = `https://www.linkedin.com/feed/update/${postId}/`;
  const numericId = postId.split(':').pop();
  if (!numericId) return fallback;

  try {
    const res = await fetch(`${LINKEDIN_API_BASE}/shares/${numericId}`, {
      headers: { Authorization: `Bearer ${token}`, 'X-Restli-Protocol-Version': '2.0.0' },
    });
    const json = await res.json().catch(() => ({}));
    if (!res.ok) {
      console.log(`[LinkedIn] permalink lookup for ${postId} failed (${res.status}), using direct urn link. Response:`, JSON.stringify(json));
      return fallback;
    }
    const activity = json.activity as string | undefined;
    if (!activity) {
      console.log(`[LinkedIn] permalink lookup for ${postId} had no activity field, using direct urn link. Response:`, JSON.stringify(json));
      return fallback;
    }
    return `https://www.linkedin.com/feed/update/${activity}/`;
  } catch (err) {
    console.log(`[LinkedIn] permalink lookup for ${postId} threw, using direct urn link:`, err);
    return fallback;
  }
}

export async function postToLinkedIn(
  text: string,
  media?: MediaUpload | string | string[],
  credentials?: { token: string; authorId: string }
): Promise<LinkedInPostResult> {
  const token = credentials?.token ?? process.env.LINKEDIN_ACCESS_TOKEN;
  const authorId = credentials?.authorId ?? process.env.LINKEDIN_AUTHOR_ID;

  if (!token || !authorId) {
    return { success: false, error: 'LINKEDIN_ACCESS_TOKEN or LINKEDIN_AUTHOR_ID not configured.' };
  }

  const authorUrn = buildAuthorUrn(authorId);
  let shareMediaCategory = 'NONE';
  let mediaElements: object[] | undefined;

  if (Array.isArray(media)) {
    // Multi-image share: register + upload each image separately, then list
    // them all as media elements on the same ugcPost (LinkedIn's multi-image
    // share format).
    const urls = media.filter(Boolean);
    if (urls.length > 0) {
      try {
        const assets = await Promise.all(
          urls.map(async url => {
            const imgRes = await fetch(url);
            if (!imgRes.ok) throw new Error(`Failed to fetch image: ${imgRes.status}`);
            const data = await imgRes.arrayBuffer();
            const mimeType = imgRes.headers.get('content-type') ?? 'image/jpeg';
            const { uploadUrl, asset } = await registerUpload(token, authorUrn, 'IMAGE');
            await uploadMedia(uploadUrl, data, mimeType);
            return asset;
          })
        );
        shareMediaCategory = 'IMAGE';
        mediaElements = assets.map(asset => ({ status: 'READY', media: asset }));
      } catch (err) {
        return { success: false, error: err instanceof Error ? err.message : String(err) };
      }
    }
  } else if (media) {
    let mediaUpload: MediaUpload;

    if (typeof media === 'string') {
      // Fetch image from URL
      const imgRes = await fetch(media);
      if (!imgRes.ok) return { success: false, error: `Failed to fetch image: ${imgRes.status}` };
      const data = await imgRes.arrayBuffer();
      const mimeType = imgRes.headers.get('content-type') ?? 'image/jpeg';
      mediaUpload = { data, mimeType, mediaType: 'IMAGE' };
    } else {
      mediaUpload = media;
    }

    try {
      const { uploadUrl, asset } = await registerUpload(token, authorUrn, mediaUpload.mediaType);
      await uploadMedia(uploadUrl, mediaUpload.data, mediaUpload.mimeType);
      shareMediaCategory = mediaUpload.mediaType;
      mediaElements = [{ status: 'READY', media: asset }];
    } catch (err) {
      return { success: false, error: err instanceof Error ? err.message : String(err) };
    }
  }

  const shareContent: Record<string, unknown> = { shareCommentary: { text }, shareMediaCategory };
  if (mediaElements) shareContent.media = mediaElements;

  const res = await fetch(`${LINKEDIN_API_BASE}/ugcPosts`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
      'X-Restli-Protocol-Version': '2.0.0',
    },
    body: JSON.stringify({
      author: authorUrn,
      lifecycleState: 'PUBLISHED',
      specificContent: { 'com.linkedin.ugc.ShareContent': shareContent },
      visibility: { 'com.linkedin.ugc.MemberNetworkVisibility': 'PUBLIC' },
    }),
  });

  if (!res.ok)
    return { success: false, error: `LinkedIn API error ${res.status}: ${await res.text()}` };

  const postId = res.headers.get('x-restli-id') ?? undefined;
  return {
    success: true,
    postId,
    url: postId ? await getLinkedInPermalink(postId, token) : undefined,
  };
}

/** Posts a video to LinkedIn given a URL (e.g. a Cloudinary-hosted
 * HeyGen render) rather than bytes already in hand -- unlike Meta's video
 * APIs, LinkedIn's Assets API has no "fetch this URL yourself" option, so
 * this downloads the video here and hands the bytes to postToLinkedIn's
 * existing registerUpload/uploadMedia path, same as a Telegram-uploaded
 * video already does via app/api/linkedin/process/route.ts. */
export async function postVideoToLinkedInFromUrl(
  caption: string,
  videoUrl: string,
  credentials?: { token: string; authorId: string }
): Promise<LinkedInPostResult> {
  const videoRes = await fetch(videoUrl);
  if (!videoRes.ok) return { success: false, error: `Failed to fetch video: ${videoRes.status}` };
  const data = await videoRes.arrayBuffer();
  const mimeType = videoRes.headers.get('content-type') ?? 'video/mp4';
  return postToLinkedIn(caption, { data, mimeType, mediaType: 'VIDEO' }, credentials);
}
