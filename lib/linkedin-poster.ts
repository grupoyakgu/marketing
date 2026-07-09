const LINKEDIN_API_BASE = 'https://api.linkedin.com/v2';

export interface LinkedInPostResult {
  success: boolean;
  postId?: string;
  url?: string;
  error?: string;
}

type MediaType = 'IMAGE' | 'VIDEO';

export interface MediaUpload {
  data: Uint8Array;
  mimeType: string;
  mediaType: MediaType;
}

function buildAuthorUrn(authorId: string): string {
  if (authorId.startsWith('urn:li:')) return authorId;
  if (authorId.startsWith('organization:')) return `urn:li:${authorId}`;
  return `urn:li:person:${authorId}`;
}

async function registerUpload(token: string, authorUrn: string, mediaType: MediaType): Promise<{ uploadUrl: string; asset: string }> {
  const recipe = mediaType === 'IMAGE'
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
        serviceRelationships: [{ identifier: 'urn:li:userGeneratedContent', relationshipType: 'OWNER' }],
      },
    }),
  });

  if (!res.ok) throw new Error(`LinkedIn registerUpload failed ${res.status}: ${await res.text()}`);

  const json = await res.json();
  const uploadUrl: string = json.value.uploadMechanism['com.linkedin.digitalmedia.uploading.MediaUploadHttpRequest'].uploadUrl;
  const asset: string = json.value.asset;
  return { uploadUrl, asset };
}

async function uploadMedia(uploadUrl: string, data: Uint8Array, mimeType: string): Promise<void> {
  const res = await fetch(uploadUrl, {
    method: 'PUT',
    headers: { 'Content-Type': mimeType },
    body: data,
  });
  if (!res.ok) throw new Error(`LinkedIn media upload failed ${res.status}: ${await res.text()}`);
}

export async function postToLinkedIn(text: string, media?: MediaUpload): Promise<LinkedInPostResult> {
  const token = process.env.LINKEDIN_ACCESS_TOKEN;
  const authorId = process.env.LINKEDIN_AUTHOR_ID;

  if (!token || !authorId) {
    return { success: false, error: 'LINKEDIN_ACCESS_TOKEN or LINKEDIN_AUTHOR_ID not configured.' };
  }

  const authorUrn = buildAuthorUrn(authorId);
  let shareMediaCategory = 'NONE';
  let mediaElements: object[] | undefined;

  if (media) {
    try {
      const { uploadUrl, asset } = await registerUpload(token, authorUrn, media.mediaType);
      await uploadMedia(uploadUrl, media.data, media.mimeType);
      shareMediaCategory = media.mediaType;
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

  if (!res.ok) return { success: false, error: `LinkedIn API error ${res.status}: ${await res.text()}` };

  const postId = res.headers.get('x-restli-id') ?? undefined;
  return { success: true, postId, url: postId ? `https://www.linkedin.com/feed/update/${postId}/` : undefined };
}
