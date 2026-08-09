import { getPendingFollowupIds, claimFollowup, markFollowupDone, markFollowupFailed } from './angeles-followups';
import { chat } from './product-agent';
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

export async function processAngelesFollowups(): Promise<{ processed: number }> {
  const ids = await getPendingFollowupIds();
  let processed = 0;

  for (const id of ids) {
    // Claimed atomically (pending -> processing) so an overlapping cron tick
    // — this runs every 5 minutes, and a single followup can legitimately
    // take longer — never picks up the same one twice.
    const followup = await claimFollowup(id);
    if (!followup) continue;
    processed++;

    const telegram = new TelegramClient(process.env.ANGELES_BOT_TOKEN);
    try {
      // No senderId: this is a system-triggered turn, not a message from
      // the bot setup's owner, so delegate_to_santi's owner check inside
      // Angeles's own tool loop correctly still blocks her from shipping
      // code off the back of a teammate's reply alone — code changes still
      // require the user to actually ask, same as always.
      const reply = await chat(followup.chat_id, followup.message);
      for (const chunk of splitMessage(reply, 4000)) {
        await telegram.sendMessage(followup.chat_id, chunk);
      }
      await markFollowupDone(followup.id);
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      await markFollowupFailed(followup.id, message);
      await telegram.sendMessage(
        followup.chat_id,
        `❌ Angeles couldn't process a teammate's reply: ${message}`
      );
    }
  }

  return { processed };
}
