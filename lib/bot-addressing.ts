interface TelegramMessageLike {
  text?: string;
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

/** Whether a group message is explicitly directed at a given bot: it starts
 * with the bot's name (e.g. "Santi, can you...") or is a reply to that
 * bot's own earlier message. Pepe and Santi share one group chat and both
 * see every message Telegram delivers to them, so without this check every
 * message would go to both bots regardless of who it was actually meant
 * for. */
export function isAddressedTo(message: TelegramMessageLike, name: string, botToken: string | undefined): boolean {
  const text = message.text?.trim();
  if (text && new RegExp(`^@?${name}\\b`, 'i').test(text)) return true;

  const botId = botIdFromToken(botToken);
  return botId !== undefined && message.reply_to_message?.from?.id === botId;
}
