import { supabase } from '@/lib/supabase';

/** Claims a Telegram update_id so a retried webhook delivery of the same
 * update is a no-op instead of a second concurrent run racing the first over
 * the same chat_history rows. Returns true the first time an update_id is
 * seen (go ahead and process it), false if it's already been claimed (skip).
 * Fails open (treats as not-a-duplicate) on any error other than the unique
 * violation that means "already claimed", so a dedup-table hiccup never
 * drops a real message.
 *
 * Scoped per bot: update_id is only unique within one Telegram bot's own
 * update stream, so a second bot's independently-numbered (and initially
 * low) update_ids would otherwise collide with ones an older, busier bot
 * already claimed. */
export async function claimTelegramUpdate(updateId: number, botName: string): Promise<boolean> {
  const { error } = await supabase.from('telegram_processed_updates').insert({ update_id: updateId, bot: botName });
  if (!error) return true;
  if (error.code === '23505') return false;
  console.error('[telegram-dedup] claimTelegramUpdate failed, processing anyway:', error.message);
  return true;
}
