import { supabase } from './supabase';

// How long a caller will wait for a lock already held by another in-flight
// chat() turn for the same bot+chat before giving up — generous enough for a
// slow tool call (browse_social_search can legitimately take over a minute)
// without blocking a cron run indefinitely.
const ACQUIRE_RETRIES = 20;
const ACQUIRE_INTERVAL_MS = 3000;

export class ChatBusyError extends Error {}

async function tryAcquire(chatId: number, bot: string): Promise<boolean> {
  const { data, error } = await supabase.rpc('acquire_bot_chat_lock', {
    p_chat_id: chatId,
    p_bot: bot,
  });
  if (error) {
    console.error('[chat-lock] acquire failed:', error.message);
    return true; // fail open -- a lock outage must never be able to wedge every bot
  }
  return data === true;
}

/** Serializes every chat() turn for a given (chatId, bot) pair. Without this,
 * an independent cron (process-bot-followups, process-bot-consultations,
 * process-santi-delegations, process-interaction-fetches) calling chat()
 * directly can interleave its own loadHistory/saveMessage calls with a live
 * Telegram webhook's in-flight turn for the same bot+chat, landing a message
 * between a saved tool_use and its matching tool_result — which Anthropic's
 * API then rejects on every future turn until the conversation is reset (see
 * lib/chat-history.ts's repairOrphanedToolUse, which only covers the
 * hard-crash case, not this one). Throws ChatBusyError if the lock is still
 * held after waiting — callers that can safely retry later (the cron
 * processors) should treat that as "try again next tick," not a real
 * failure. */
export async function acquireChatLock(chatId: number, bot: string): Promise<void> {
  for (let attempt = 0; attempt < ACQUIRE_RETRIES; attempt++) {
    if (await tryAcquire(chatId, bot)) return;
    await new Promise(resolve => setTimeout(resolve, ACQUIRE_INTERVAL_MS));
  }
  throw new ChatBusyError(`${bot} is still finishing a previous request in this chat.`);
}

export async function releaseChatLock(chatId: number, bot: string): Promise<void> {
  const { error } = await supabase.rpc('release_bot_chat_lock', { p_chat_id: chatId, p_bot: bot });
  if (error) console.error('[chat-lock] release failed:', error.message);
}
