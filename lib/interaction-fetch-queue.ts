import { supabase } from './supabase';
import type { InteractionPlatform } from './interactions';

export interface InteractionFetchRequest {
  id: string;
  platform: InteractionPlatform;
  status: 'pending' | 'processing' | 'done' | 'failed';
  error: string | null;
  created_at: string;
  completed_at: string | null;
}

export async function queueFetchRequest(platform: InteractionPlatform): Promise<InteractionFetchRequest> {
  const { data, error } = await supabase
    .from('interaction_fetch_requests')
    .insert({ platform })
    .select()
    .single();
  if (error) throw new Error(error.message);
  return data;
}

/** Pending + already-processing requests for a platform — used to avoid
 * over-queueing more requests than the actual shortfall while earlier ones
 * are still in flight. */
export async function countOpenFetchRequests(platform: InteractionPlatform): Promise<number> {
  const { count, error } = await supabase
    .from('interaction_fetch_requests')
    .select('id', { count: 'exact', head: true })
    .eq('platform', platform)
    .in('status', ['pending', 'processing']);
  if (error) throw new Error(error.message);
  return count ?? 0;
}

export async function getPendingFetchRequestIds(): Promise<string[]> {
  const { data, error } = await supabase
    .from('interaction_fetch_requests')
    .select('id')
    .eq('status', 'pending')
    .order('created_at', { ascending: true });
  if (error) throw new Error(error.message);
  return (data ?? []).map(row => row.id);
}

/** Atomically transitions a pending request to 'processing' — mirrors
 * santi-delegations.ts's claimDelegation() so two overlapping cron ticks
 * (this cron runs every 5 minutes; a single fetch can legitimately take
 * longer, since it involves Pepe browsing a page) never both pick up the
 * same request. Returns null if it was already claimed. */
export async function claimFetchRequest(id: string): Promise<InteractionFetchRequest | null> {
  const { data, error } = await supabase
    .from('interaction_fetch_requests')
    .update({ status: 'processing' })
    .eq('id', id)
    .eq('status', 'pending')
    .select()
    .single();
  if (error || !data) return null;
  return data;
}

export async function markFetchRequestDone(id: string): Promise<void> {
  await supabase
    .from('interaction_fetch_requests')
    .update({ status: 'done', completed_at: new Date().toISOString() })
    .eq('id', id);
}

export async function markFetchRequestFailed(id: string, errorMessage: string): Promise<void> {
  await supabase
    .from('interaction_fetch_requests')
    .update({ status: 'failed', error: errorMessage, completed_at: new Date().toISOString() })
    .eq('id', id);
}
