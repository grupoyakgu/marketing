import Anthropic from '@anthropic-ai/sdk';
import { postToLinkedIn } from '@/lib/linkedin-poster';
import { postToFacebook, postToInstagram } from '@/lib/meta-poster';
import { loadHistory, saveMessage, clearHistory as clearDb } from '@/lib/chat-history';

const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
const BOT_NAME = 'pepe';

const SYSTEM_PROMPT = `You are Pepe, a highly experienced marketing expert with 25+ years in real estate development focused on the hotel and hospitality ecosystem. Your background spans luxury resorts, boutique hotels, eco-lodges, mixed-use developments, and hospitality-anchored real estate projects across Latin America and Europe.

You have deep expertise in:
- Positioning hotel real estate projects to investors, developers, and buyers
- B2B and B2C marketing strategies for hospitality-driven developments
- LinkedIn, Instagram and Facebook content and thought leadership for the hotel/real estate sector
- Crafting compelling narratives around eco-tourism, sustainable hospitality, and resort living
- Targeting the right audiences: family offices, institutional investors, HNWIs, hotel operators, and lifestyle buyers
- Campaign planning, content calendars, and messaging frameworks for pre-sales and launches

You can write and publish content directly to LinkedIn, Facebook, and Instagram. When you draft content, always offer to post it immediately to the relevant platforms. If the user approves, use the appropriate tool to publish — do not ask them to copy/paste commands.

For Instagram posts, you need an image URL. If the user wants to post to Instagram without an image, let them know they need to provide one.

You speak with authority and warmth. You are direct, strategic, and deeply passionate about the intersection of hospitality and real estate. Communicate in the same language the user uses (Spanish or English).`;

const tools: Anthropic.Tool[] = [
  {
    name: 'post_to_linkedin',
    description: 'Publishes a text post to LinkedIn on behalf of the user.',
    input_schema: {
      type: 'object' as const,
      properties: {
        content: { type: 'string', description: 'The text content to post on LinkedIn.' },
      },
      required: ['content'],
    },
  },
  {
    name: 'post_to_facebook',
    description: 'Publishes a text post to the Grupo YAKGU Facebook Page.',
    input_schema: {
      type: 'object' as const,
      properties: {
        message: { type: 'string', description: 'The text content to post on Facebook.' },
      },
      required: ['message'],
    },
  },
  {
    name: 'post_to_instagram',
    description: 'Publishes an image post to Instagram. Requires a publicly accessible image URL.',
    input_schema: {
      type: 'object' as const,
      properties: {
        caption: { type: 'string', description: 'The caption for the Instagram post.' },
        image_url: { type: 'string', description: 'A publicly accessible URL of the image to post.' },
      },
      required: ['caption', 'image_url'],
    },
  },
];

type MessageParam = Anthropic.MessageParam;

export async function clearHistory(chatId: number): Promise<void> {
  await clearDb(chatId, BOT_NAME);
}

export async function chat(chatId: number, userMessage: string): Promise<string> {
  const history = await loadHistory(chatId, BOT_NAME);
  history.push({ role: 'user', content: userMessage });
  await saveMessage(chatId, BOT_NAME, 'user', userMessage);

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

        let resultContent = '';

        if (block.name === 'post_to_linkedin') {
          const input = block.input as { content: string };
          const result = await postToLinkedIn(input.content);
          resultContent = result.success
            ? `Posted to LinkedIn!${result.url ? ` URL: ${result.url}` : ''}`
            : `Failed: ${result.error}`;
        }

        if (block.name === 'post_to_facebook') {
          const input = block.input as { message: string };
          const result = await postToFacebook(input.message);
          resultContent = result.success
            ? `Posted to Facebook!${result.url ? ` URL: ${result.url}` : ''}`
            : `Failed: ${result.error}`;
        }

        if (block.name === 'post_to_instagram') {
          const input = block.input as { caption: string; image_url: string };
          const result = await postToInstagram(input.caption, input.image_url);
          resultContent = result.success
            ? `Posted to Instagram!${result.url ? ` URL: ${result.url}` : ''}`
            : `Failed: ${result.error}`;
        }

        toolResults.push({
          type: 'tool_result',
          tool_use_id: block.id,
          content: resultContent,
        });
      }

      history.push({ role: 'user', content: toolResults });
      continue;
    }

    const textBlock = response.content.find(b => b.type === 'text');
    if (!textBlock || textBlock.type !== 'text') throw new Error('No text response');

    const reply = textBlock.text;
    await saveMessage(chatId, BOT_NAME, 'assistant', reply);

    return reply;
  }
}
