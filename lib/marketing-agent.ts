import Anthropic from '@anthropic-ai/sdk';

const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

const SYSTEM_PROMPT = `You are a senior marketing strategist specializing in LinkedIn growth and B2B content marketing.

You help plan and execute LinkedIn marketing efforts: content strategy, post ideas, campaign planning, audience targeting, engagement tactics, and copywriting.

When the user wants to publish something, you can suggest they use the command:
/post linkedin <message>

Or send a photo/video with caption: /post linkedin <message>

Be concise, actionable, and strategic. Communicate in the same language the user uses (Spanish or English).`;

export interface Message {
  role: 'user' | 'assistant';
  content: string;
}

const histories = new Map<number, Message[]>();

export function getHistory(chatId: number): Message[] {
  if (!histories.has(chatId)) histories.set(chatId, []);
  return histories.get(chatId)!;
}

export function clearHistory(chatId: number): void {
  histories.delete(chatId);
}

export async function chat(chatId: number, userMessage: string): Promise<string> {
  const history = getHistory(chatId);
  history.push({ role: 'user', content: userMessage });

  const response = await client.messages.create({
    model: 'claude-sonnet-4-6',
    max_tokens: 1024,
    system: SYSTEM_PROMPT,
    messages: history,
  });

  const block = response.content[0];
  if (block.type !== 'text') throw new Error('Unexpected response type');

  const reply = block.text;
  history.push({ role: 'assistant', content: reply });

  // Keep history bounded to last 20 messages
  if (history.length > 20) history.splice(0, history.length - 20);

  return reply;
}
