import { supabase } from './supabase';

export interface SantiDelegation {
  id: string;
  chat_id: number;
  instructions: string;
  status: 'pending' | 'processing' | 'done' | 'failed';
  error: string | null;
  created_at: string;
  completed_at: string | null;
}

export async function createDelegation(chatId: number, instructions: string): Promise<SantiDelegation> {
  const { data, error } = await supabase
    .from('santi_delegations')
    .insert({ chat_id: chatId, instructions })
    .select()
    .single();
  if (error) throw new Error(error.message);
  return data;
}

export async function getPendingDelegationIds(): Promise<string[]> {
  const { data, error } = await supabase
    .from('santi_delegations')
    .select('id')
    .eq('status', 'pending')
    .order('created_at', { ascending: true });
  if (error) throw new Error(error.message);
  return (data ?? []).map(row => row.id);
}

/** Atomically transitions a pending delegation to 'processing' — mirrors
 * linkedin-queue.ts's claimJob() so two overlapping cron ticks (this cron
 * runs every 5 minutes; a single delegation can legitimately take longer)
 * can never both pick up and run the same delegation. Returns null if it
 * was already claimed. */
export async function claimDelegation(id: string): Promise<SantiDelegation | null> {
  const { data, error } = await supabase
    .from('santi_delegations')
    .update({ status: 'processing' })
    .eq('id', id)
    .eq('status', 'pending')
    .select()
    .single();
  if (error || !data) return null;
  return data;
}

export async function markDelegationDone(id: string): Promise<void> {
  await supabase.from('santi_delegations').update({ status: 'done', completed_at: new Date().toISOString() }).eq('id', id);
}

export async function markDelegationFailed(id: string, errorMessage: string): Promise<void> {
  await supabase
    .from('santi_delegations')
    .update({ status: 'failed', error: errorMessage, completed_at: new Date().toISOString() })
    .eq('id', id);
}
