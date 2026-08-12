import { supabase } from './supabase';
import type { BotName } from './bot-addressing';

export interface BotConsultation {
  id: string;
  chat_id: number;
  from_bot: BotName;
  to_bot: BotName;
  brief: string;
  status: 'pending' | 'processing' | 'done' | 'failed';
  error: string | null;
  created_at: string;
  completed_at: string | null;
}

export async function createConsultation(
  chatId: number,
  fromBot: BotName,
  toBot: BotName,
  brief: string
): Promise<BotConsultation> {
  const { data, error } = await supabase
    .from('bot_consultations')
    .insert({ chat_id: chatId, from_bot: fromBot, to_bot: toBot, brief })
    .select()
    .single();
  if (error) throw new Error(error.message);
  return data;
}

export async function getPendingConsultationIds(): Promise<string[]> {
  const { data, error } = await supabase
    .from('bot_consultations')
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
export async function claimConsultation(id: string): Promise<BotConsultation | null> {
  const { data, error } = await supabase
    .from('bot_consultations')
    .update({ status: 'processing' })
    .eq('id', id)
    .eq('status', 'pending')
    .select()
    .single();
  if (error || !data) return null;
  return data;
}

/** Reverts a claimed consultation back to 'pending' — used when the reply
 * had to bail because the target bot's chat lock was busy (see
 * lib/chat-lock.ts), which isn't a real failure, just bad timing; the next
 * cron tick retries it normally instead of it being lost to a permanent
 * 'failed' status. */
export async function releaseConsultationClaim(id: string): Promise<void> {
  await supabase.from('bot_consultations').update({ status: 'pending' }).eq('id', id);
}

export async function markConsultationDone(id: string): Promise<void> {
  await supabase.from('bot_consultations').update({ status: 'done', completed_at: new Date().toISOString() }).eq('id', id);
}

export async function markConsultationFailed(id: string, errorMessage: string): Promise<void> {
  await supabase
    .from('bot_consultations')
    .update({ status: 'failed', error: errorMessage, completed_at: new Date().toISOString() })
    .eq('id', id);
}
