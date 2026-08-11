import { supabase } from '@/lib/supabase';

export interface CronSetting {
  id: string;
  path: string;
  name: string;
  schedule: string;
  description: string;
  enabled: boolean;
  updated_at: string;
}

export async function listCronSettings(): Promise<CronSetting[]> {
  const { data, error } = await supabase.from('cron_settings').select('*').order('name', { ascending: true });
  if (error) throw new Error(error.message);
  return data ?? [];
}

/** Checked by each cron route itself at the top of its handler -- Vercel has
 * no runtime API to disable an individual cron, so the schedule in
 * vercel.json always fires; this is what actually makes "disabled" mean
 * "does nothing" instead of "keeps running anyway". Fails open (returns
 * true) on a lookup error or a missing row, so a settings-table hiccup
 * can't silently stop a cron that was never meant to be disabled. */
export async function isCronEnabled(id: string): Promise<boolean> {
  const { data, error } = await supabase.from('cron_settings').select('enabled').eq('id', id).maybeSingle();
  if (error || !data) return true;
  return data.enabled;
}

export async function setCronEnabled(id: string, enabled: boolean): Promise<void> {
  const { error } = await supabase.from('cron_settings').update({ enabled, updated_at: new Date().toISOString() }).eq('id', id);
  if (error) throw new Error(error.message);
}
