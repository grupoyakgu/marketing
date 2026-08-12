import { getPendingDelegationIds, claimDelegation, markDelegationDone, markDelegationFailed, releaseDelegationClaim } from './santi-delegations';
import { chat } from './dev-agent';
import { TelegramClient } from './telegram';
import { splitMessage } from './split-message';
import { ChatBusyError } from './chat-lock';

export async function processSantiDelegations(): Promise<{ processed: number }> {
  const ids = await getPendingDelegationIds();
  let processed = 0;

  for (const id of ids) {
    // Claimed atomically (pending -> processing) so an overlapping cron tick
    // — this runs every 5 minutes, and a single delegation can legitimately
    // take longer than that — never picks up the same one twice.
    const delegation = await claimDelegation(id);
    if (!delegation) continue;
    processed++;

    const telegram = new TelegramClient(process.env.SANTI_BOT_TOKEN);
    try {
      const reply = await chat(delegation.chat_id, delegation.instructions);
      for (const chunk of splitMessage(reply, 4000)) {
        await telegram.sendMessage(delegation.chat_id, chunk);
      }
      await markDelegationDone(delegation.id);
    } catch (err) {
      if (err instanceof ChatBusyError) {
        // Not a real failure — Santi is still mid-turn on something else for
        // this chat. Put it back for the next tick instead of losing it to a
        // permanent 'failed' status or telling the user about it.
        await releaseDelegationClaim(delegation.id);
        continue;
      }
      const message = err instanceof Error ? err.message : String(err);
      await markDelegationFailed(delegation.id, message);
      await telegram.sendMessage(
        delegation.chat_id,
        `❌ Santi couldn't complete the delegated task: ${message}`
      );
    }
  }

  return { processed };
}
