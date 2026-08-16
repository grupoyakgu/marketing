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
 * HEYGEN_DEFAULT_VOICE_ID when not passed explicitly. */
export async function createVideo(
  script: string,
  avatarId?: string,
  voiceId?: string,
  motionPrompt?: string
): Promise<CreateVideoResult> {
  const apiKey = getApiKey();
  if (!apiKey) return { error: 'HeyGen is not configured (HEYGEN_API_KEY missing).' };

  const resolvedAvatarId = avatarId || process.env.HEYGEN_DEFAULT_AVATAR_ID;
  const resolvedVoiceId = voiceId || process.env.HEYGEN_DEFAULT_VOICE_ID;
  if (!resolvedAvatarId || !resolvedVoiceId) {
    return { error: 'No avatar/voice configured — set HEYGEN_DEFAULT_AVATAR_ID and HEYGEN_DEFAULT_VOICE_ID, or pass them explicitly.' };
  }

  const videoInput: Record<string, unknown> = {
    character: { type: 'avatar', avatar_id: resolvedAvatarId, avatar_style: 'normal' },
    voice: { type: 'text', input_text: script, voice_id: resolvedVoiceId },
  };

  const requestBody: Record<string, unknown> = {
    video_inputs: [videoInput],
    dimension: { width: 1080, height: 1920 },
  };
  if (motionPrompt) {
    requestBody.motion_prompt = motionPrompt;
  }

  const res = await fetchHeyGen('/v2/video/generate', {
    method: 'POST',
    headers: { 'X-Api-Key': apiKey, 'Content-Type': 'application/json' },
    body: JSON.stringify(requestBody),
  });
  const json = await res.json().catch(() => ({}));
  if (!res.ok || json.error) {
    console.error(`HeyGen createVideo failed: ${res.status} ${JSON.stringify(json)}`);
    return { error: (json.error?.message as string) ?? (json.error as string) ?? `Failed to start video generation (${res.status}).` };
  }
  const videoId = json.data?.video_id as string | undefined;
  if (!videoId) return { error: 'HeyGen did not return a video_id.' };
  return { videoId };
}

export interface HeyGenStatus {
  status: 'pending' | 'processing' | 'completed' | 'failed';
  videoUrl?: string;
  error?: string;
}

export async function getVideoStatus(videoId: string): Promise<HeyGenStatus> {
  const apiKey = getApiKey();
  if (!apiKey) return { status: 'failed', error: 'HeyGen is not configured.' };

  const res = await fetchHeyGen(`/v1/video_status.get?video_id=${videoId}`, {
    headers: { 'X-Api-Key': apiKey },
    cache: 'no-store',
  });
  const json = await res.json().catch(() => ({}));
  if (!res.ok) {
    console.error(`HeyGen getVideoStatus failed for ${videoId}: ${res.status} ${JSON.stringify(json)}`);
    return { status: 'failed', error: `Failed to check video status (${res.status}).` };
  }
  const data = json.data ?? {};
  return {
    status: data.status,
    videoUrl: data.video_url,
    error: typeof data.error === 'string' ? data.error : data.error?.message,
  };
}
