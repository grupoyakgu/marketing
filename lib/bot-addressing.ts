interface TelegramMessageLike {
  text?: string;
  from?: { is_bot?: boolean; id?: number };
  reply_to_message?: { from?: { id?: number } };
}

export type BotName = 'pepe' | 'santi' | 'angeles';

export interface BotIdentity {
  name: BotName;
  token: string | undefined;
}

/** Display label for each bot, e.g. for prefixing a passively-recorded
 * teammate message or a consultation brief so a bot can tell who it's from. */
export const BOT_LABELS: Record<BotName, string> = {
  pepe: 'Pepe — CMO',
  santi: 'Santi — CTO',
  angeles: 'Angeles — CPO',
};

/** A Telegram bot token is "<numeric bot id>:<secret>" — the id half is the
 * bot's own Telegram user id, the same id that shows up as
 * reply_to_message.from.id when someone replies to that bot's message. No
 * extra API call needed to learn it. */
export function botIdFromToken(token: string | undefined): number | undefined {
  const id = token?.split(':')[0];
  return id && /^\d+$/.test(id) ? Number(id) : undefined;
}

/** Every bot sharing this Telegram group, so addressing can be resolved once
 * per message instead of as N independent per-bot checks that could
 * disagree with each other. */
export function allBots(): BotIdentity[] {
  return [
    { name: 'pepe', token: process.env.TELEGRAM_BOT_TOKEN },
    { name: 'santi', token: process.env.SANTI_BOT_TOKEN },
    { name: 'angeles', token: process.env.ANGELES_BOT_TOKEN },
  ];
}

/** Which bot (by name) a group message is addressed to, or null if it isn't
 * clearly addressed to any one of them. Pepe, Santi, and Angeles share one
 * group chat and all see every message Telegram delivers to them, so
 * without this every message would go to every bot regardless of who it
 * was actually meant for.
 *
 * Never resolves to a bot for a message sent by another bot — the three
 * bots know about each other and can freely mention one another by name in
 * conversation, and if that alone counted as addressing, one bot's reply
 * mentioning a second could make the second reply and mention the first
 * back, looping indefinitely (real API cost, real chat spam) with no human
 * involved. A bot can suggest "ask Santi about this", but only a human
 * actually asking Santi triggers a response.
 *
 * Checks explicit naming (e.g. "Santi, can you...", "Hi Angeles") before
 * falling back to reply-to-message context, not the other way around —
 * replying to a bot's last message is a convenience for continuing that
 * conversation without restating its name each time, but if the text
 * itself names a *different* bot (e.g. typing "Pepe, ..." while the
 * Telegram client still has an older Angeles message selected as the
 * reply target, which mobile clients do easily), the explicit name has to
 * win or the message goes to the wrong bot regardless of what was typed.
 *
 * When more than one bot's name appears in the text (e.g. "Angeles, get
 * Santi to build this"), picks whichever name appears earliest in the
 * message, not whichever bot happens to come first in the `bots` array —
 * that's the one actually being addressed; the other is just mentioned. */
export function resolveAddressee(message: TelegramMessageLike, bots: BotIdentity[]): string | null {
  if (message.from?.is_bot) return null;

  const text = message.text;
  if (text) {
    let earliest: { name: string; index: number } | null = null;
    for (const bot of bots) {
      const match = new RegExp(`\\b${bot.name}\\b`, 'i').exec(text);
      if (match && (earliest === null || match.index < earliest.index)) {
        earliest = { name: bot.name, index: match.index };
      }
    }
    if (earliest) return earliest.name;
  }

  const replyToId = message.reply_to_message?.from?.id;
  if (replyToId !== undefined) {
    for (const bot of bots) {
      if (botIdFromToken(bot.token) === replyToId) return bot.name;
    }
  }

  return null;
}

/** Which teammate bot authored this message, or null if it wasn't sent by
 * any of them (a human, or a bot not in this list). Unlike
 * resolveAddressee — which deliberately never resolves a bot-authored
 * message as "addressed" to anyone, to avoid a reply loop — this exists so
 * each bot's route can still passively record what a teammate posted as
 * context on its own history, without treating it as something to respond
 * to. See recordTeammateMessage in each of marketing-agent.ts, dev-agent.ts,
 * and product-agent.ts. */
export function identifyBotAuthor(message: TelegramMessageLike, bots: BotIdentity[]): BotName | null {
  if (!message.from?.is_bot) return null;
  const fromId = message.from.id;
  for (const bot of bots) {
    if (botIdFromToken(bot.token) === fromId) return bot.name;
  }
  return null;
}
