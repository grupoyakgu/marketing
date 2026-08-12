import { getPendingConsultationIds, claimConsultation, markConsultationDone, markConsultationFailed, releaseConsultationClaim } from './bot-consultations';
import { createFollowup } from './bot-followups';
import { BOT_REGISTRY } from './bot-registry';
import { TelegramClient } from './telegram';
import { splitMessage } from './split-message';
import { ChatBusyError } from './chat-lock';

export async function processBotConsultations(): Promise<{ processed: number }> {
  const ids = await getPendingConsultationIds();
  let processed = 0;

  for (const id of ids) {
    // Claimed atomically (pending -> processing) so an overlapping cron tick
    // — this runs every 5 minutes, and a single consultation can
    // legitimately take longer — never picks up the same one twice.
    const consultation = await claimConsultation(id);
    if (!consultation) continue;
    processed++;

    const toBot = BOT_REGISTRY[consultation.to_bot];
    const fromBot = BOT_REGISTRY[consultation.from_bot];
    const telegram = new TelegramClient(toBot.token);
    try {
      const reply = await toBot.chat(
        consultation.chat_id,
        `[Consultation from ${fromBot.label}]\n\n${consultation.brief}`
      );
      for (const chunk of splitMessage(reply, 4000)) {
        await telegram.sendMessage(consultation.chat_id, chunk);
      }
      await markConsultationDone(consultation.id);
      // Posting the reply to the shared chat above makes it visible to the
      // human, but the asking bot's own conversation has no way to know a
      // teammate ever answered (bot-authored messages never resolve as
      // addressed to another bot — see bot-addressing.ts). Feed it back into
      // their own chat() loop via the same decoupled pattern so they
      // actually become aware and can continue.
      await createFollowup(
        consultation.chat_id,
        consultation.from_bot,
        `[Reply from ${toBot.label}, re: your consultation]\n\n${reply}`
      );
    } catch (err) {
      if (err instanceof ChatBusyError) {
        // Not a real failure — the answering bot is still mid-turn on
        // something else for this chat. Put it back for the next tick
        // instead of losing it to a permanent 'failed' status or telling
        // the asking bot it's never getting a reply.
        await releaseConsultationClaim(consultation.id);
        continue;
      }
      const message = err instanceof Error ? err.message : String(err);
      await markConsultationFailed(consultation.id, message);
      await telegram.sendMessage(
        consultation.chat_id,
        `❌ ${toBot.label} couldn't weigh in on ${fromBot.label}'s consultation: ${message}`
      );
      // Same reasoning as the success path above: the asking bot needs to
      // know this failed too, or it keeps waiting on a reply that's never
      // coming.
      await createFollowup(
        consultation.chat_id,
        consultation.from_bot,
        `[System] Your consultation to ${toBot.label} failed: ${message}\n\nThey won't be replying to this one — let the user know if it's still relevant, or proceed without their input.`
      );
    }
  }

  return { processed };
}
