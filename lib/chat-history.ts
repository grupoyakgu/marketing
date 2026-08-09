import { supabase } from '@/lib/supabase';
import Anthropic from '@anthropic-ai/sdk';
import { allBots, BOT_LABELS, type BotName } from '@/lib/bot-addressing';

type MessageParam = Anthropic.MessageParam;

// Content is stored JSON-encoded so tool_use/tool_result blocks (which carry IDs
// the agent needs to remember, e.g. a just-created post's ID) survive across
// requests, not just the final plain-text reply. Rows written before this change
// hold raw unencoded text, so parsing falls back to the raw string on failure.
function parseContent(raw: string): MessageParam['content'] {
  try {
    return JSON.parse(raw);
  } catch {
    return raw;
  }
}

function isOrphanToolResult(content: MessageParam['content']): boolean {
  return Array.isArray(content) && content.length > 0 && content.every(b => b.type === 'tool_result');
}

function toolUseIds(content: MessageParam['content']): string[] {
  if (!Array.isArray(content)) return [];
  return content.filter(b => b.type === 'tool_use').map(b => b.id);
}

function toolResultIds(content: MessageParam['content']): Set<string> {
  if (!Array.isArray(content)) return new Set();
  return new Set(content.filter(b => b.type === 'tool_result').map(b => b.tool_use_id));
}

/** A hard timeout (Vercel SIGKILL) can strike between saving an assistant
 * message with tool_use blocks and appending its matching tool_result reply,
 * leaving those permanently orphaned in storage. Anthropic's API then
 * rejects the request wherever that gap sits in the message list, not just
 * at the end — an important distinction, because chat()'s own retry saves
 * the caller's next plain-text message to history unconditionally, even
 * after a failed turn, which pushes the orphaned tool_use out of the
 * trailing position on the very next attempt. So this has to walk the
 * whole loaded window and patch every gap it finds, not just check the
 * last message. */
function repairOrphanedToolUse(messages: MessageParam[]): MessageParam[] {
  const repaired: MessageParam[] = [];
  for (let i = 0; i < messages.length; i++) {
    const message = messages[i];
    repaired.push(message);

    const pendingIds = toolUseIds(message.content);
    if (pendingIds.length === 0) continue;

    const resolvedIds = toolResultIds(messages[i + 1]?.content);
    const missingIds = pendingIds.filter(id => !resolvedIds.has(id));
    if (missingIds.length === 0) continue;

    repaired.push({
      role: 'user',
      content: missingIds.map(id => ({
        type: 'tool_result' as const,
        tool_use_id: id,
        content: 'Interrupted before this finished (the process was killed mid-request, likely by a hard timeout) — no result was ever recorded. Treat it as failed.',
        is_error: true,
      })),
    });
  }
  return repaired;
}

export async function loadHistory(chatId: number, botName: string): Promise<MessageParam[]> {
  const { data, error } = await supabase
    .from('chat_history')
    .select('role, content')
    .eq('chat_id', chatId)
    .eq('bot', botName)
    .order('created_at', { ascending: false })
    .limit(40);

  if (error) {
    console.error('[chat-history] loadHistory failed:', error.message);
    return [];
  }
  if (!data) return [];

  const messages = data.reverse().map(row => ({
    role: row.role as 'user' | 'assistant',
    content: parseContent(row.content),
  }));

  // The limit() above can truncate mid tool_use/tool_result exchange, leaving a
  // leading tool_result with no matching tool_use in view — the API rejects that.
  while (messages.length && messages[0].role === 'user' && isOrphanToolResult(messages[0].content)) {
    messages.shift();
  }

  // Self-heals any orphaned tool_use the same way — synthesized fresh on
  // every load rather than written back to storage, so it costs nothing
  // when absent and never needs a migration to undo.
  return repairOrphanedToolUse(messages);
}

export async function saveMessage(
  chatId: number,
  botName: string,
  role: 'user' | 'assistant',
  content: MessageParam['content']
): Promise<void> {
  const { error } = await supabase.from('chat_history').insert({
    chat_id: chatId,
    bot: botName,
    role,
    content: JSON.stringify(content),
  });
  if (error) console.error('[chat-history] saveMessage failed:', error.message);
}

export async function clearHistory(chatId: number, botName: string): Promise<void> {
  await supabase.from('chat_history').delete().eq('chat_id', chatId).eq('bot', botName);
}

/** Telegram never delivers a bot's own outgoing message back out as a
 * webhook update to the other bots in the group — confirmed empirically
 * (zero deliveries across days of live bot-to-bot traffic) and consistent
 * with Telegram's anti-loop behavior for bot-authored messages. So the only
 * way for a teammate to learn what another bot just said in the shared
 * chat is for the sender to push it directly into the others' history
 * itself, right when it posts — not wait to passively "hear" it via the
 * webhook, which never fires. Call this once per bot reply, right after
 * it's sent to the group. */
export async function broadcastToTeammates(chatId: number, fromBot: BotName, text: string): Promise<void> {
  const others = allBots().filter(bot => bot.name !== fromBot);
  await Promise.all(
    others.map(bot => saveMessage(chatId, bot.name, 'user', `[${BOT_LABELS[fromBot]} posted in the group]\n\n${text}`))
  );
}
