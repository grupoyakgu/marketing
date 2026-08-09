import { supabase } from './supabase';
import type { BotName } from './bot-addressing';

export interface BotFollowup {
  id: string;
  chat_id: number;
  bot: BotName;
  message: string;
  status: 'pending' | 'processing' | 'done' | 'failed';
  error: string | null;
  created_at: string;
  completed_at: string | null;
}

export async function createFollowup(chatId: number, bot: BotName, message: string): Promise<BotFollowup> {
  const { data, error } = await supabase
    .from('bot_followups')
    .insert({ chat_id: chatId, bot, message })
    .select()
    .single();
  if (error) throw new Error(error.message);
  return data;
}

export async function getPendingFollowupIds(): Promise<string[]> {
  const { data, error } = await supabase
    .from('bot_followups')
    .select('id')
    .eq('status', 'pending')
    .order('created_at', { ascending: true });
  if (error) throw new Error(error.message);
  return (data ?? []).map(row => row.id);
}

/** Atomically transitions a pending followup to 'processing' — mirrors
 * bot-consultations.ts's claimConsultation() so two overlapping cron ticks
 * (this cron runs every 5 minutes; a single followup can legitimately take
 * longer) can never both pick up and run the same one. Returns null if it
 * was already claimed. */
export async function claimFollowup(id: string): Promise<BotFollowup | null> {
  const { data, error } = await supabase
    .from('bot_followups')
    .update({ status: 'processing' })
    .eq('id', id)
    .eq('status', 'pending')
    .select()
    .single();
  if (error || !data) return null;
  return data;
}

export async function markFollowupDone(id: string): Promise<void> {
  await supabase.from('bot_followups').update({ status: 'done', completed_at: new Date().toISOString() }).eq('id', id);
}

export async function markFollowupFailed(id: string, errorMessage: string): Promise<void> {
  await supabase
    .from('bot_followups')
    .update({ status: 'failed', error: errorMessage, completed_at: new Date().toISOString() })
    .eq('id', id);
}
