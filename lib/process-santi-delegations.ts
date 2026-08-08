import { getPendingDelegationIds, claimDelegation, markDelegationDone, markDelegationFailed } from './santi-delegations';
import { chat } from './dev-agent';
import { TelegramClient } from './telegram';

// Splits by Unicode code point (Array.from), not raw index — a raw slice()
// cut can land inside a surrogate pair, leaving a chunk with a dangling lone
// surrogate that breaks JSON encoding downstream (see PR #97).
function splitMessage(text: string, maxLen: number): string[] {
  const codePoints = Array.from(text);
  if (codePoints.length <= maxLen) return [text];
  const chunks: string[] = [];
  for (let i = 0; i < codePoints.length; i += maxLen) {
    chunks.push(codePoints.slice(i, i + maxLen).join(''));
  }
  return chunks;
}

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
