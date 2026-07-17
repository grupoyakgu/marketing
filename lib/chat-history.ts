import { createClient } from '@supabase/supabase-js';
import Anthropic from '@anthropic-ai/sdk';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

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
