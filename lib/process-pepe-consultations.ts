import { getPendingConsultationIds, claimConsultation, markConsultationDone, markConsultationFailed } from './pepe-consultations';
import { chat } from './marketing-agent';
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

export async function processPepeConsultations(): Promise<{ processed: number }> {
  const ids = await getPendingConsultationIds();
  let processed = 0;

  for (const id of ids) {
    // Claimed atomically (pending -> processing) so an overlapping cron tick
    // — this runs every 5 minutes, and a single consultation can
    // legitimately take longer — never picks up the same one twice.
    const consultation = await claimConsultation(id);
    if (!consultation) continue;
    processed++;

    const telegram = new TelegramClient(process.env.TELEGRAM_BOT_TOKEN);
    try {
      const reply = await chat(
        consultation.chat_id,
        `[Consultation from Angeles — CPO]\n\n${consultation.brief}`
      );
      for (const chunk of splitMessage(reply, 4000)) {
        await telegram.sendMessage(consultation.chat_id, chunk);
      }
      await markConsultationDone(consultation.id);
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      await markConsultationFailed(consultation.id, message);
      await telegram.sendMessage(
        consultation.chat_id,
        `❌ Pepe couldn't weigh in on Angeles's consultation: ${message}`
      );
    }
  }

  return { processed };
}
