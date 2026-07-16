import { createClient } from '@supabase/supabase-js';
import Anthropic from '@anthropic-ai/sdk';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

type MessageParam = Anthropic.MessageParam;

export async function loadHistory(chatId: number, botName: string): Promise<MessageParam[]> {
  const { data, error } = await supabase
    .from('chat_history')
    .select('role, content')
    .eq('chat_id', chatId)
    .eq('bot', botName)
    .order('created_at', { ascending: true })
    .limit(20);

  if (error || !data) return [];

  return data.map(row => ({
    role: row.role as 'user' | 'assistant',
    content: typeof row.content === 'string' ? row.content : JSON.stringify(row.content),
  }));
}

export async function saveMessage(chatId: number, botName: string, role: 'user' | 'assistant', content: string): Promise<void> {
  await supabase.from('chat_history').insert({
    chat_id: chatId,
    bot: botName,
    role,
    content,
  });
}

export async function clearHistory(chatId: number, botName: string): Promise<void> {
  await supabase.from('chat_history').delete().eq('chat_id', chatId).eq('bot', botName);
}
