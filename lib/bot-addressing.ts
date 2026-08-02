interface TelegramMessageLike {
  text?: string;
  from?: { is_bot?: boolean };
  reply_to_message?: { from?: { id?: number } };
}

/** A Telegram bot token is "<numeric bot id>:<secret>" — the id half is the
 * bot's own Telegram user id, the same id that shows up as
 * reply_to_message.from.id when someone replies to that bot's message. No
 * extra API call needed to learn it. */
function botIdFromToken(token: string | undefined): number | undefined {
  const id = token?.split(':')[0];
  return id && /^\d+$/.test(id) ? Number(id) : undefined;
}

/** Whether a group message is explicitly directed at a given bot: its name
 * appears anywhere in the text (e.g. "Santi, can you...", "Hi Angeles",
 * "what do you think, Santi?") or it's a reply to that bot's own earlier
 * message. Pepe, Santi, and Angeles share one group chat and all see every
 * message Telegram delivers to them, so without this check every message
 * would go to every bot regardless of who it was actually meant for.
 *
 * Only ever matches messages from a human. The three bots know about each
 * other and can freely mention one another by name in conversation — if
 * that alone counted as "addressed", one bot's reply mentioning a second
 * could make the second reply and mention the first back, looping
 * indefinitely (real API cost, real chat spam) with no human involved.
 * Restricting matching to human senders closes that off entirely: a bot
 * can suggest "ask Santi about this", but only the human actually asking
 * Santi triggers a response. */
export function isAddressedTo(message: TelegramMessageLike, name: string, botToken: string | undefined): boolean {
  if (message.from?.is_bot) return false;

  const text = message.text;
  if (text && new RegExp(`\\b${name}\\b`, 'i').test(text)) return true;

  const botId = botIdFromToken(botToken);
  return botId !== undefined && message.reply_to_message?.from?.id === botId;
}
