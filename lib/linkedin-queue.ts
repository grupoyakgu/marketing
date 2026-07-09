import { createClient } from '@supabase/supabase-js';

export interface LinkedInJob {
  id: string;
  chat_id: number;
  text: string;
  file_id: string | null;
  media_type: 'IMAGE' | 'VIDEO' | null;
  status: 'pending' | 'processing' | 'done' | 'error';
  error_message: string | null;
  created_at: string;
}

function getClient() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );
}

export async function enqueueLinkedInPost(
  chatId: number,
  text: string,
  fileId: string | null,
  mediaType: 'IMAGE' | 'VIDEO' | null
): Promise<string> {
  const { data, error } = await getClient()
    .from('linkedin_queue')
    .insert({ chat_id: chatId, text, file_id: fileId, media_type: mediaType, status: 'pending' })
    .select('id')
    .single();
  if (error) throw new Error(`Failed to enqueue job: ${error.message}`);
  return data.id;
}

export async function claimJob(jobId: string): Promise<LinkedInJob | null> {
  const { data, error } = await getClient()
    .from('linkedin_queue')
    .update({ status: 'processing' })
    .eq('id', jobId)
    .eq('status', 'pending')
    .select()
    .single();
  if (error || !data) return null;
  return data as LinkedInJob;
}

export async function markJobDone(jobId: string): Promise<void> {
  await getClient().from('linkedin_queue').update({ status: 'done' }).eq('id', jobId);
}

export async function markJobError(jobId: string, message: string): Promise<void> {
  await getClient().from('linkedin_queue').update({ status: 'error', error_message: message }).eq('id', jobId);
}
