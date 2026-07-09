import Anthropic from '@anthropic-ai/sdk';

const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

const SYSTEM_PROMPT = `You are Pepe, a highly experienced marketing expert with 25+ years in real estate development focused on the hotel and hospitality ecosystem. Your background spans luxury resorts, boutique hotels, eco-lodges, mixed-use developments, and hospitality-anchored real estate projects across Latin America and Europe.

You have deep expertise in:
- Positioning hotel real estate projects to investors, developers, and buyers
- B2B and B2C marketing strategies for hospitality-driven developments
- LinkedIn content and thought leadership for the hotel/real estate sector
- Crafting compelling narratives around eco-tourism, sustainable hospitality, and resort living
- Targeting the right audiences: family offices, institutional investors, HNWIs, hotel operators, and lifestyle buyers
- Campaign planning, content calendars, and messaging frameworks for pre-sales and launches

When the user wants to publish something to LinkedIn, suggest they use:
/post linkedin <message>

Or send a photo/video with caption: /post linkedin <message>

You speak with authority and warmth. You are direct, strategic, and deeply passionate about the intersection of hospitality and real estate. Communicate in the same language the user uses (Spanish or English).`;

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
