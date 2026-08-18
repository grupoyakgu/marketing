const HEYGEN_API = 'https://api.heygen.com';
const HEYGEN_TIMEOUT_MS = 15_000;

function getApiKey(): string | null {
  return process.env.HEYGEN_API_KEY || null;
}

/** Plain fetch() has no timeout of its own — a stalled HeyGen connection would
 * hang until the caller's outer tool-dispatch guard (45s) kills it, with no
 * real error to show for it. AbortSignal.timeout() here fails fast with a
 * clear message instead. */
async function fetchHeyGen(path: string, init: RequestInit = {}): Promise<Response> {
  try {
    return await fetch(`${HEYGEN_API}${path}`, { ...init, signal: AbortSignal.timeout(HEYGEN_TIMEOUT_MS) });
  } catch (err) {
    if (err instanceof Error && err.name === 'TimeoutError') {
      throw new Error(`HeyGen request to ${path} timed out after ${HEYGEN_TIMEOUT_MS}ms.`);
    }
    throw err;
  }
}

export interface HeyGenAvatar {
  avatarId: string;
  name: string;
  previewImageUrl: string | null;
}

export interface HeyGenVoice {
  voiceId: string;
  name: string;
  language: string | null;
}

export async function listAvatars(): Promise<HeyGenAvatar[]> {
  const apiKey = getApiKey();
  if (!apiKey) return [];
  const res = await fetchHeyGen('/v2/avatars', { headers: { 'X-Api-Key': apiKey }, cache: 'no-store' });
  const json = await res.json().catch(() => ({}));
  if (!res.ok) {
    console.error(`HeyGen listAvatars failed: ${res.status} ${JSON.stringify(json)}`);
    return [];
  }
  const avatars: Record<string, unknown>[] = json.data?.avatars ?? [];
  return avatars.map(a => ({
    avatarId: a.avatar_id as string,
    name: (a.avatar_name as string) ?? (a.avatar_id as string),
    previewImageUrl: (a.preview_image_url as string) ?? null,
  }));
}

interface HeyGenAvatarGroup {
  id: string;
  name: string;
}

/** The account's own custom avatars ("My Avatars" in the HeyGen dashboard)
 * aren't returned by listAvatars() above -- that's HeyGen's public stock
 * library only (GET /v2/avatars). A custom avatar lives under a completely
 * different shape: it's a "group" (GET /v2/avatar_group.list, include_public
 * defaults to false so this only returns the account's own groups), and each
 * group can have multiple "looks" -- each its own avatar_id, fetched
 * separately per group (GET /v2/avatar_group/{id}/avatars). */
async function listAvatarGroups(): Promise<HeyGenAvatarGroup[]> {
  const apiKey = getApiKey();
  if (!apiKey) return [];
  const res = await fetchHeyGen('/v2/avatar_group.list?include_public=false', {
    headers: { 'X-Api-Key': apiKey },
    cache: 'no-store',
  });
  const json = await res.json().catch(() => ({}));
  if (!res.ok) {
    console.error(`HeyGen listAvatarGroups failed: ${res.status} ${JSON.stringify(json)}`);
    return [];
  }
  const groups: Record<string, unknown>[] = json.data?.avatar_group_list ?? [];
  return groups.map(g => ({ id: g.id as string, name: (g.name as string) ?? (g.id as string) }));
}

// HeyGen's own community forum has open threads asking whether a "look"
// object's identifier field is "id" or "avatar_id" -- it isn't consistently
// documented, so every third-party integration we could find falls back
// across both rather than assuming one. Same for the image field
// (image_url vs preview_image_url).
async function listLooksInGroup(group: HeyGenAvatarGroup): Promise<HeyGenAvatar[]> {
  const apiKey = getApiKey();
  if (!apiKey) return [];
  const res = await fetchHeyGen(`/v2/avatar_group/${group.id}/avatars`, {
    headers: { 'X-Api-Key': apiKey },
    cache: 'no-store',
  });
  const json = await res.json().catch(() => ({}));
  if (!res.ok) {
    console.error(`HeyGen listLooksInGroup failed for group ${group.id}: ${res.status} ${JSON.stringify(json)}`);
    return [];
  }
  const data = json.data;
  const looks: Record<string, unknown>[] = data?.avatar_list ?? data?.avatars ?? (Array.isArray(data) ? data : []);
  const mapped: (HeyGenAvatar | null)[] = looks.map((l, i) => {
    const avatarId = (l.id ?? l.avatar_id) as string | undefined;
    if (!avatarId) return null;
    return {
      avatarId,
      name: (l.name as string) ?? (l.avatar_name as string) ?? `${group.name} #${i + 1}`,
      previewImageUrl: (l.image_url as string) ?? (l.preview_image_url as string) ?? null,
    };
  });
  return mapped.filter((a): a is HeyGenAvatar => a !== null);
}

// Bounds the number of extra API calls this makes (one per group, on top of
// the group list itself) if an account has built up a lot of avatar groups.
const MAX_MY_AVATAR_GROUPS = 20;

/** Every "look" across every one of the account's own custom avatar groups,
 * flattened into the same shape listAvatars() returns so callers don't need
 * to know the difference between a group's look and a public stock avatar --
 * both are just a usable avatar_id for create_video. */
export async function listMyAvatars(): Promise<HeyGenAvatar[]> {
  const groups = (await listAvatarGroups()).slice(0, MAX_MY_AVATAR_GROUPS);
  const looksPerGroup = await Promise.all(groups.map(listLooksInGroup));
  return looksPerGroup.flat();
}

export async function listVoices(): Promise<HeyGenVoice[]> {
  const apiKey = getApiKey();
  if (!apiKey) return [];
  const res = await fetchHeyGen('/v2/voices', { headers: { 'X-Api-Key': apiKey }, cache: 'no-store' });
  const json = await res.json().catch(() => ({}));
  if (!res.ok) {
    console.error(`HeyGen listVoices failed: ${res.status} ${JSON.stringify(json)}`);
    return [];
  }
  const voices: Record<string, unknown>[] = json.data?.voices ?? [];
  return voices.map(v => ({
    voiceId: v.voice_id as string,
    name: (v.name as string) ?? (v.voice_id as string),
    language: (v.language as string) ?? null,
  }));
}

export interface CreateVideoResult {
  videoId?: string;
  error?: string;
}

/** Kicks off HeyGen video generation and returns immediately with a video_id —
 * generation itself takes minutes, so callers must poll getVideoStatus rather
 * than wait here. avatarId/voiceId default to HEYGEN_DEFAULT_AVATAR_ID /
 * HEYGEN_DEFAULT_VOICE_ID when not passed explicitly. captions defaults to
 * true (burned-in captions) — pass false to render clean with no on-screen
 * captions.
 *
 * Calls POST /v3/videos. Two earlier versions of this got this endpoint
 * wrong in opposite directions: a hand-guessed v3 body (HeyGen's docs were
 * unreachable from this environment) 400'd in production, so a later
 * version dropped v3 entirely for the legacy /v2/video/generate endpoint —
 * which turned out to silently ignore motion_prompt/expressiveness/caption
 * while still returning 200, per that endpoint's own deprecation warning
 * telling AI agents specifically not to use it. This body shape is
 * confirmed working -- verified directly against HeyGen's own v3 API via
 * their MCP server using this account's real avatar/voice IDs -- so v3 is
 * used exclusively now, and a failure surfaces loudly through the error
 * path below rather than silently downgrading into a v2 fallback again. */
export async function createVideo(
  script: string,
  avatarId?: string,
  voiceId?: string,
  motionPrompt?: string,
  captions = true
): Promise<CreateVideoResult> {
  const apiKey = getApiKey();
  if (!apiKey) return { error: 'HeyGen is not configured (HEYGEN_API_KEY missing).' };

  const resolvedAvatarId = avatarId || process.env.HEYGEN_DEFAULT_AVATAR_ID;
  const resolvedVoiceId = voiceId || process.env.HEYGEN_DEFAULT_VOICE_ID;
  if (!resolvedAvatarId || !resolvedVoiceId) {
    return { error: 'No avatar/voice configured — set HEYGEN_DEFAULT_AVATAR_ID and HEYGEN_DEFAULT_VOICE_ID, or pass them explicitly.' };
  }

  const body: Record<string, unknown> = {
    type: 'avatar',
    avatar_id: resolvedAvatarId,
    script,
    voice_id: resolvedVoiceId,
    aspect_ratio: '9:16',
    resolution: '1080p',
  };
  if (motionPrompt) {
    body.motion_prompt = motionPrompt;
    body.expressiveness = 'high';
  }
  // A sidecar .srt is always generated once `caption` is set at all;
  // `style: 'default'` additionally burns captions into the rendered
  // video, returned separately as captioned_video_url (see getVideoStatus
  // below) rather than replacing video_url.
  if (captions) {
    body.caption = { file_format: 'srt', style: 'default' };
  }

  console.log(`[HeyGen] createVideo: motion_prompt: ${motionPrompt ? 'yes' : 'no'}, captions: ${captions}`);
  console.log(`[HeyGen] request body:`, JSON.stringify(body, null, 2));

  const res = await fetchHeyGen('/v3/videos', {
    method: 'POST',
    headers: { 'X-Api-Key': apiKey, 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  const json = await res.json().catch(() => ({}));
  console.log(`[HeyGen] response (${res.status}):`, JSON.stringify(json, null, 2));

  if (!res.ok || json.error) {
    console.error(`HeyGen createVideo failed: ${res.status} ${JSON.stringify(json)}`);
    return { error: (json.error?.message as string) ?? (json.error as string) ?? `Failed to start video generation (${res.status}).` };
  }
  // Defensive about exactly where video_id lands -- confirmed flat
  // (json.video_id) via HeyGen's own MCP server, but that may normalize the
  // raw wire shape rather than reflect it exactly.
  const videoId = (json.video_id ?? json.data?.video_id ?? json.id ?? json.data?.id) as string | undefined;
  if (!videoId) return { error: 'HeyGen did not return a video_id.' };
  return { videoId };
}

export interface HeyGenStatus {
  status: 'pending' | 'processing' | 'completed' | 'failed';
  videoUrl?: string;
  error?: string;
}

/** Polls GET /v3/videos/{id} -- the v3 counterpart to createVideo above,
 * not the legacy /v1/video_status.get this used before. Matters beyond just
 * matching the create call: v3 returns a completed render's plain video
 * separately from its captioned one (video_url vs captioned_video_url) --
 * preferring captioned_video_url here is what actually makes a requested
 * caption show up in the video callers post, rather than being generated
 * and then silently left unused. */
export async function getVideoStatus(videoId: string): Promise<HeyGenStatus> {
  const apiKey = getApiKey();
  if (!apiKey) return { status: 'failed', error: 'HeyGen is not configured.' };

  const res = await fetchHeyGen(`/v3/videos/${videoId}`, {
    headers: { 'X-Api-Key': apiKey },
    cache: 'no-store',
  });
  const json = await res.json().catch(() => ({}));
  if (!res.ok) {
    console.error(`HeyGen getVideoStatus failed for ${videoId}: ${res.status} ${JSON.stringify(json)}`);
    return { status: 'failed', error: `Failed to check video status (${res.status}).` };
  }
  const data = json.data ?? json;
  const status: HeyGenStatus['status'] =
    data.status === 'completed' ? 'completed' : (data.status === 'failed' || data.failure_code) ? 'failed' : 'processing';
  return {
    status,
    videoUrl: data.captioned_video_url || data.video_url,
    error: data.failure_message || (typeof data.error === 'string' ? data.error : data.error?.message),
  };
}
