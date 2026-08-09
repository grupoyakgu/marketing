import { supabase } from './supabase';

export interface PepeConsultation {
  id: string;
  chat_id: number;
  brief: string;
  status: 'pending' | 'processing' | 'done' | 'failed';
  error: string | null;
  created_at: string;
  completed_at: string | null;
}

export async function createConsultation(chatId: number, brief: string): Promise<PepeConsultation> {
  const { data, error } = await supabase
    .from('pepe_consultations')
    .insert({ chat_id: chatId, brief })
    .select()
    .single();
  if (error) throw new Error(error.message);
  return data;
}

export async function getPendingConsultationIds(): Promise<string[]> {
  const { data, error } = await supabase
    .from('pepe_consultations')
    .select('id')
    .eq('status', 'pending')
    .order('created_at', { ascending: true });
  if (error) throw new Error(error.message);
  return (data ?? []).map(row => row.id);
}

/** Atomically transitions a pending consultation to 'processing' — mirrors
 * santi-delegations.ts's claimDelegation() so two overlapping cron ticks
 * (this cron runs every 5 minutes; a single consultation can legitimately
 * take longer) can never both pick up and run the same one. Returns null if
 * it was already claimed. */
export async function claimConsultation(id: string): Promise<PepeConsultation | null> {
  const { data, error } = await supabase
    .from('pepe_consultations')
    .update({ status: 'processing' })
    .eq('id', id)
    .eq('status', 'pending')
    .select()
    .single();
  if (error || !data) return null;
  return data;
}

export async function markConsultationDone(id: string): Promise<void> {
  await supabase.from('pepe_consultations').update({ status: 'done', completed_at: new Date().toISOString() }).eq('id', id);
}

export async function markConsultationFailed(id: string, errorMessage: string): Promise<void> {
  await supabase
    .from('pepe_consultations')
    .update({ status: 'failed', error: errorMessage, completed_at: new Date().toISOString() })
    .eq('id', id);
}
