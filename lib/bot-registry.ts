import type { BotName } from '@/lib/bot-addressing';
import { BOT_LABELS } from '@/lib/bot-addressing';
import { chat as pepeChat } from '@/lib/marketing-agent';
import { chat as santiChat } from '@/lib/dev-agent';
import { chat as angelesChat } from '@/lib/product-agent';

interface BotRegistryEntry {
  label: string;
  token: string | undefined;
  /** Runs one full chat() turn for this bot, decoupled from whichever route
   * originally triggered it — used by process-bot-consultations.ts and
   * process-bot-followups.ts so a single generic cron can dispatch to any of
   * the three bots instead of needing a bot-specific processor each. None of
   * the three chat() signatures need senderId here: a consultation or
   * followup is a system-triggered turn, not a message from a human, so
   * per-bot owner checks (e.g. Santi's) don't apply to it — same as
   * process-santi-delegations.ts's own cron-triggered calls. */
  chat: (chatId: number, message: string) => Promise<string>;
}

export const BOT_REGISTRY: Record<BotName, BotRegistryEntry> = {
  pepe: { label: BOT_LABELS.pepe, token: process.env.TELEGRAM_BOT_TOKEN, chat: pepeChat },
  santi: { label: BOT_LABELS.santi, token: process.env.SANTI_BOT_TOKEN, chat: santiChat },
  angeles: { label: BOT_LABELS.angeles, token: process.env.ANGELES_BOT_TOKEN, chat: angelesChat },
};
