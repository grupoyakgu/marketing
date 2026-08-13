import { supabase } from './supabase';

export interface VideoJob {
  id: string;
  chat_id: number | null;
  platform: 'instagram' | 'facebook';
  caption: string;
  heygen_video_id: string;
  cloudinary_url: string | null;
  ig_container_id: string | null;
  status: 'generating' | 'processing_ig' | 'posted' | 'failed';
  error: string | null;
  post_url: string | null;
  /** Set when this job came from a scheduled marketing_plan video post
   * (publishPost) rather than an ad-hoc create_video call -- lets
   * process-video-jobs.ts update that specific plan post's status instead of
   * only recording a standalone tracked_posts/marketing_plan entry. */
  plan_post_id: string | null;
  avatar_id: string | null;
}

export async function createVideoJob(fields: {
  chatId: number | null;
  platform: 'instagram' | 'facebook';
  caption: string;
  heygenVideoId: string;
  planPostId?: string | null;
  avatarId?: string | null;
}): Promise<VideoJob> {
  const { data, error } = await supabase
    .from('video_jobs')
    .insert({
      chat_id: fields.chatId,
      platform: fields.platform,
      caption: fields.caption,
      heygen_video_id: fields.heygenVideoId,
      plan_post_id: fields.planPostId ?? null,
      avatar_id: fields.avatarId ?? null,
      status: 'generating',
    })
    .select()
    .single();
  if (error) throw new Error(error.message);
  return data;
}

export async function getPendingVideoJobs(): Promise<VideoJob[]> {
  const { data, error } = await supabase
    .from('video_jobs')
    .select('*')
    .in('status', ['generating', 'processing_ig']);
  if (error) throw new Error(error.message);
  return data ?? [];
}

export async function updateVideoJob(id: string, fields: Partial<VideoJob>): Promise<void> {
  const { error } = await supabase.from('video_jobs').update(fields).eq('id', id);
  if (error) throw new Error(error.message);
}
