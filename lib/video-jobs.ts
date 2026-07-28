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
}

export async function createVideoJob(fields: {
  chatId: number | null;
  platform: 'instagram' | 'facebook';
  caption: string;
  heygenVideoId: string;
}): Promise<VideoJob> {
  const { data, error } = await supabase
    .from('video_jobs')
    .insert({
      chat_id: fields.chatId,
      platform: fields.platform,
      caption: fields.caption,
      heygen_video_id: fields.heygenVideoId,
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
