import { getPendingFollowupIds, claimFollowup, markFollowupDone, markFollowupFailed, releaseFollowupClaim } from './bot-followups';
import { BOT_REGISTRY } from './bot-registry';
import { TelegramClient } from './telegram';
import { splitMessage } from './split-message';
import { ChatBusyError } from './chat-lock';

export async function processBotFollowups(): Promise<{ processed: number }> {
  const ids = await getPendingFollowupIds();
  let processed = 0;

  for (const id of ids) {
    // Claimed atomically (pending -> processing) so an overlapping cron tick
    // — this runs every 5 minutes, and a single followup can legitimately
    // take longer — never picks up the same one twice.
    const followup = await claimFollowup(id);
    if (!followup) continue;
    processed++;

    const bot = BOT_REGISTRY[followup.bot];
    const telegram = new TelegramClient(bot.token);
    try {
      const reply = await bot.chat(followup.chat_id, followup.message);
      for (const chunk of splitMessage(reply, 4000)) {
        await telegram.sendMessage(followup.chat_id, chunk);
      }
      await markFollowupDone(followup.id);
    } catch (err) {
      if (err instanceof ChatBusyError) {
        // Not a real failure — the bot is still mid-turn on something else
        // for this chat. Put it back for the next tick instead of losing it
        // to a permanent 'failed' status or telling the user about it.
        await releaseFollowupClaim(followup.id);
        continue;
      }
      const message = err instanceof Error ? err.message : String(err);
      await markFollowupFailed(followup.id, message);
      await telegram.sendMessage(followup.chat_id, `❌ ${bot.label} couldn't process a teammate's reply: ${message}`);
    }
  }

  return { processed };
}
