const HEYGEN_API = 'https://api.heygen.com';

function getApiKey(): string | null {
  return process.env.HEYGEN_API_KEY || null;
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
  const res = await fetch(`${HEYGEN_API}/v2/avatars`, { headers: { 'X-Api-Key': apiKey }, cache: 'no-store' });
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

export async function listVoices(): Promise<HeyGenVoice[]> {
  const apiKey = getApiKey();
  if (!apiKey) return [];
  const res = await fetch(`${HEYGEN_API}/v2/voices`, { headers: { 'X-Api-Key': apiKey }, cache: 'no-store' });
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
  voiceId?: string
): Promise<CreateVideoResult> {
  const apiKey = getApiKey();
  if (!apiKey) return { error: 'HeyGen is not configured (HEYGEN_API_KEY missing).' };

  const resolvedAvatarId = avatarId || process.env.HEYGEN_DEFAULT_AVATAR_ID;
  const resolvedVoiceId = voiceId || process.env.HEYGEN_DEFAULT_VOICE_ID;
  if (!resolvedAvatarId || !resolvedVoiceId) {
    return { error: 'No avatar/voice configured — set HEYGEN_DEFAULT_AVATAR_ID and HEYGEN_DEFAULT_VOICE_ID, or pass them explicitly.' };
  }

  const res = await fetch(`${HEYGEN_API}/v2/video/generate`, {
    method: 'POST',
    headers: { 'X-Api-Key': apiKey, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      video_inputs: [
        {
          character: { type: 'avatar', avatar_id: resolvedAvatarId, avatar_style: 'normal' },
          voice: { type: 'text', input_text: script, voice_id: resolvedVoiceId },
        },
      ],
      dimension: { width: 1080, height: 1920 },
    }),
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

  const res = await fetch(`${HEYGEN_API}/v1/video_status.get?video_id=${videoId}`, {
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
