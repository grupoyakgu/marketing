import { supabase } from '@/lib/supabase';
import Anthropic from '@anthropic-ai/sdk';

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

/** IDs of any tool_use blocks in an assistant message's content, or []. A
 * hard timeout (Vercel SIGKILL) can strike between saving this message and
 * appending its matching tool_result reply, leaving these permanently
 * orphaned in storage — Anthropic's API then rejects every future message
 * in this history with a 400, forever, since it always requires a
 * tool_result immediately after a tool_use. */
function orphanToolUseIds(message: MessageParam): string[] {
  if (message.role !== 'assistant' || !Array.isArray(message.content)) return [];
  return message.content.filter(b => b.type === 'tool_use').map(b => b.id);
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

  // Self-heals a trailing orphaned tool_use the same way — synthesized fresh
  // on every load rather than written back to storage, so it costs nothing
  // when absent and never needs a migration to undo. Once a real reply gets
  // appended after it, this stops triggering on its own (no longer the last
  // message) and the synthesized turn just stays as a normal part of history.
  const lastMessage = messages[messages.length - 1];
  const danglingIds = lastMessage ? orphanToolUseIds(lastMessage) : [];
  if (danglingIds.length > 0) {
    messages.push({
      role: 'user',
      content: danglingIds.map(id => ({
        type: 'tool_result' as const,
        tool_use_id: id,
        content: 'Interrupted before this finished (the process was killed mid-request, likely by a hard timeout) — no result was ever recorded. Treat it as failed.',
        is_error: true,
      })),
    });
  }

  return messages;
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
