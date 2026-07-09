import Anthropic from '@anthropic-ai/sdk';
import { postToLinkedIn } from '@/lib/linkedin-poster';

const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

const SYSTEM_PROMPT = `You are Pepe, a highly experienced marketing expert with 25+ years in real estate development focused on the hotel and hospitality ecosystem. Your background spans luxury resorts, boutique hotels, eco-lodges, mixed-use developments, and hospitality-anchored real estate projects across Latin America and Europe.

You have deep expertise in:
- Positioning hotel real estate projects to investors, developers, and buyers
- B2B and B2C marketing strategies for hospitality-driven developments
- LinkedIn content and thought leadership for the hotel/real estate sector
- Crafting compelling narratives around eco-tourism, sustainable hospitality, and resort living
- Targeting the right audiences: family offices, institutional investors, HNWIs, hotel operators, and lifestyle buyers
- Campaign planning, content calendars, and messaging frameworks for pre-sales and launches

You can write LinkedIn posts and publish them directly. When you draft content for LinkedIn, always offer to post it immediately. If the user approves or says yes, use the post_to_linkedin tool to publish it — do not ask them to copy/paste a command.

You speak with authority and warmth. You are direct, strategic, and deeply passionate about the intersection of hospitality and real estate. Communicate in the same language the user uses (Spanish or English).`;

const tools: Anthropic.Tool[] = [
  {
    name: 'post_to_linkedin',
    description: 'Publishes a post to LinkedIn on behalf of the user. Use this when the user approves content to be posted.',
    input_schema: {
      type: 'object' as const,
      properties: {
        content: {
          type: 'string',
          description: 'The text content to post on LinkedIn.',
        },
      },
      required: ['content'],
    },
  },
];

type MessageParam = Anthropic.MessageParam;

const histories = new Map<number, MessageParam[]>();

export function getHistory(chatId: number): MessageParam[] {
  if (!histories.has(chatId)) histories.set(chatId, []);
  return histories.get(chatId)!;
}

export function clearHistory(chatId: number): void {
  histories.delete(chatId);
}

export async function chat(chatId: number, userMessage: string): Promise<string> {
  const history = getHistory(chatId);
  history.push({ role: 'user', content: userMessage });

  while (true) {
    const response = await client.messages.create({
      model: 'claude-sonnet-4-6',
      max_tokens: 1024,
      system: SYSTEM_PROMPT,
      tools,
      messages: history,
    });

    if (response.stop_reason === 'tool_use') {
      history.push({ role: 'assistant', content: response.content });

      const toolResults: Anthropic.ToolResultBlockParam[] = [];

      for (const block of response.content) {
        if (block.type !== 'tool_use') continue;

        if (block.name === 'post_to_linkedin') {
          const input = block.input as { content: string };
          const result = await postToLinkedIn(input.content);
          toolResults.push({
            type: 'tool_result',
            tool_use_id: block.id,
            content: result.success
              ? `Posted successfully!${result.url ? ` URL: ${result.url}` : ''}`
              : `Failed to post: ${result.error}`,
          });
        }
      }

      history.push({ role: 'user', content: toolResults });
      continue;
    }

    const textBlock = response.content.find(b => b.type === 'text');
    if (!textBlock || textBlock.type !== 'text') throw new Error('No text response');

    const reply = textBlock.text;
    history.push({ role: 'assistant', content: reply });

    if (history.length > 20) history.splice(0, history.length - 20);

    return reply;
  }
}
