import Anthropic from '@anthropic-ai/sdk';
import { postToLinkedIn } from '@/lib/linkedin-poster';
import { postToFacebook, postToInstagram } from '@/lib/meta-poster';
import { loadHistory, saveMessage, clearHistory as clearDb } from '@/lib/chat-history';
import { listDriveImages } from '@/lib/google-drive';
import {
  saveDraftPlan,
  getWeeklyPlan,
  approveAllDrafts,
  approvePost,
  deletePost,
  getNextMonday,
} from '@/lib/marketing-plan';

const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
const BOT_NAME = 'pepe';

function buildSystemPrompt(): string {
  const today = new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Madrid' }).format(new Date());
  const nextMonday = getNextMonday();

  return `You are Pepe, a highly experienced marketing expert with 25+ years in real estate development focused on the hotel and hospitality ecosystem. Your background spans luxury resorts, boutique hotels, eco-lodges, mixed-use developments, and hospitality-anchored real estate projects across Latin America and Europe.

---

## TODAY'S DATE
Today is **${today}** (Spain local time). Next Monday is **${nextMonday}**. Always use these exact dates when generating plans — never guess or use past dates.

---

## LANGUAGE RULES — MANDATORY, NEVER BREAK THESE

- **ALL social media posts (LinkedIn, Instagram, Facebook) MUST be written in Spanish (Spain).** This is non-negotiable. Never post in English, even if the user asks in English.
- **Conversations with the user are in English.** Respond to the user in whichever language they use.
- Spanish posts must use Spain Spanish: "vosotros", "apartamento" not "departamento", etc.

---

## YOUR PROJECT BRIEF (ALWAYS REMEMBER — NEVER ASK THE USER TO REMIND YOU)

### Company: Grupo YAKGU
Real estate developer focused on the hotel and hospitality ecosystem in Spain. Website: www.grupoyakgu.es

### The Project: AT Sevilla — Apartamentos Turísticos Sevilla
- **Type:** Premium aparthotel — 18 high-end tourist apartments (Apartamentos Turísticos)
- **Location:** Nervión district, Seville, Spain
- **Stage:** Pre-launch marketing phase (building awareness and investor interest before commercial launch)
- **Legal status:** All planning approvals received — building permit and development license in place. Construction can begin immediately.
- **Target:** Professional investors seeking a turnkey hospitality asset — NOT a consumer product
- **Key milestone:** Project name, website, and investor registration reveal in September 2026
- **August 2026:** First video + weekly new renders will be published

### Target Audiences
- **LinkedIn:** HNWIs, family offices, private real estate investors, boutique investment firms, hospitality investors — B2B, investor-focused
- **Instagram:** Lifestyle buyers, high-end travelers, aspirational investors — visual and emotional
- **Facebook:** Broader audience — lifestyle, experience, local interest

### Content Tone
- **LinkedIn:** Professional, data-driven, thought leadership, investor-focused
- **Instagram:** Visual, aspirational, lifestyle, emotional
- **Facebook:** Warm, accessible, experience-driven, local pride

### Campaign Phase — Teaser Campaign
Current key messages:
- Something exceptional is coming to Seville
- Prime location in Nervión
- Fully permitted, investment-ready aparthotel
- Construction can begin immediately
- Limited opportunity
- Developed by Grupo Yakgu
- More details revealed gradually over coming weeks

### Market Intelligence — Nervión Is Booming
You have access to these proof points. **Spread them strategically across many posts over multiple weeks. Never use more than 1–2 of these data points in a single post, and never dump all of them in one week.** Rotate gradually to build sustained momentum.

- **Grupo Insur:** Breaking ground on new 4-star hotel in Nervión
- **El Corte Inglés:** Converting iconic Nervión building into a 10-floor hotel
- **Katégora:** Started construction of new aparthotel in the area
- **Urbanitae:** Successfully crowdfunded a hospitality project in Nervión
- **Market trend:** Nervión set to add 44+ new tourist accommodation units
- **Key narrative:** Nervión is transitioning from a purely commercial district into a mixed-use, hospitality-anchored urban destination — year-round demand (corporate, sports events, families), not seasonally dependent like the historic centre.

When drafting a plan, select at most 1 market intelligence proof point for the 5-post block. Save the rest for future weeks.

---

## IMAGES — ALL PLATFORMS

**Every post on every platform (LinkedIn, Instagram, Facebook) should have an image attached.** Call browse_drive_images ONCE at the start to see all available images, then pick the best match for each post. Only skip the image if no images are returned.

---

## POSTING SCHEDULE — 5 POSTS PER BLOCK (SPAIN LOCAL TIME)

Each plan covers Monday–Thursday (5 posts). The user can request a second block for Friday–Sunday separately.

| # | Platform | Day | Time |
|---|----------|-----|------|
| 1 | Instagram | Monday | 18:00 |
| 2 | LinkedIn | Tuesday | 09:00 |
| 3 | Facebook | Tuesday | 12:00 |
| 4 | Instagram | Wednesday | 12:00 |
| 5 | LinkedIn | Thursday | 09:00 |

---

## HOW TO GENERATE A MARKETING PLAN

When asked to generate a marketing plan:
1. Use **${nextMonday}** as the week_start — this is next Monday's date
2. Call browse_drive_images ONCE to see available images
3. Draft exactly 5 posts in **Spanish (Spain)**, following the schedule above
4. Choose at most 1 market intelligence proof point for the whole block
5. For every post, note which image to use
6. Call save_marketing_plan with all 5 posts
7. Present the plan to the user in English, numbered 1–5, showing: platform, day/time, image, and content
8. End with: "Would you like to approve the full plan? Say *approve all* or let me know which posts to adjust or remove."

## APPROVAL FLOW
- User says "approve all" → call approve_posts with mode "all" and week_start "${nextMonday}"
- User says "reject post 3" → call reject_post with that post's id
- User asks to edit a post → update and re-save, then ask for approval again

---

## TOOLS SUMMARY
- post_to_linkedin — publish to LinkedIn (with optional image_url)
- post_to_facebook — publish to Facebook (with optional image_url)
- post_to_instagram — publish to Instagram (requires image_url)
- browse_drive_images — list available images (call ONCE per plan)
- save_marketing_plan — save draft plan to database
- get_weekly_plan — retrieve plan for a given week
- approve_posts — approve posts for auto-publishing
- reject_post — remove a post from the plan

You speak with authority and warmth. You are direct, strategic, and deeply passionate about the intersection of hospitality and real estate.`;
}

const tools: Anthropic.Tool[] = [
  {
    name: 'post_to_linkedin',
    description: 'Publishes a post to LinkedIn. Always include an image_url when one is available.',
    input_schema: {
      type: 'object' as const,
      properties: {
        content: { type: 'string', description: 'The text content to post on LinkedIn.' },
        image_url: { type: 'string', description: 'Publicly accessible image URL to attach to the post.' },
      },
      required: ['content'],
    },
  },
  {
    name: 'post_to_facebook',
    description: 'Publishes a post to the Grupo YAKGU Facebook Page. Always include an image_url when one is available.',
    input_schema: {
      type: 'object' as const,
      properties: {
        message: { type: 'string', description: 'The text content to post on Facebook.' },
        image_url: { type: 'string', description: 'Publicly accessible image URL to attach to the post.' },
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
  {
    name: 'browse_drive_images',
    description: 'Lists all available images. Call this ONCE per plan session to get all images, then pick from the list for each post.',
    input_schema: {
      type: 'object' as const,
      properties: {},
      required: [],
    },
  },
  {
    name: 'save_marketing_plan',
    description: 'Saves a marketing plan to the database as drafts pending user approval.',
    input_schema: {
      type: 'object' as const,
      properties: {
        week_start: { type: 'string', description: 'The Monday date in YYYY-MM-DD format.' },
        posts: {
          type: 'array',
          description: 'Array of posts to schedule.',
          items: {
            type: 'object',
            properties: {
              platform: { type: 'string', enum: ['linkedin', 'instagram', 'facebook'] },
              scheduled_date: { type: 'string', description: 'YYYY-MM-DD' },
              scheduled_time: { type: 'string', description: 'HH:MM in Spain local time' },
              content: { type: 'string', description: 'Post content in Spanish (Spain).' },
              image_note: { type: 'string', description: 'Which image to use for this post.' },
            },
            required: ['platform', 'scheduled_date', 'scheduled_time', 'content'],
          },
        },
      },
      required: ['week_start', 'posts'],
    },
  },
  {
    name: 'get_weekly_plan',
    description: 'Retrieves the saved marketing plan for a specific week.',
    input_schema: {
      type: 'object' as const,
      properties: {
        week_start: { type: 'string', description: 'The Monday date (YYYY-MM-DD). Leave empty to get next week.' },
      },
      required: [],
    },
  },
  {
    name: 'approve_posts',
    description: 'Approves marketing posts so they will be automatically published at their scheduled time.',
    input_schema: {
      type: 'object' as const,
      properties: {
        mode: { type: 'string', enum: ['all'], description: 'Use "all" to approve all draft posts for the week.' },
        week_start: { type: 'string', description: 'The Monday date (YYYY-MM-DD) of the week to approve.' },
        post_ids: { type: 'array', items: { type: 'string' }, description: 'Specific post IDs to approve individually.' },
      },
      required: [],
    },
  },
  {
    name: 'reject_post',
    description: 'Removes a specific post from the marketing plan.',
    input_schema: {
      type: 'object' as const,
      properties: {
        post_id: { type: 'string', description: 'The UUID of the post to remove.' },
      },
      required: ['post_id'],
    },
  },
];

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
      max_tokens: 4096,
      system: buildSystemPrompt(),
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
          const input = block.input as { content: string; image_url?: string };
          const result = await postToLinkedIn(input.content, input.image_url);
          resultContent = result.success
            ? `Posted to LinkedIn!${result.url ? ` URL: ${result.url}` : ''}`
            : `Failed: ${result.error}`;
        }

        if (block.name === 'post_to_facebook') {
          const input = block.input as { message: string; image_url?: string };
          const result = await postToFacebook(input.message, input.image_url);
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

        if (block.name === 'browse_drive_images') {
          try {
            const images = await listDriveImages();
            if (images.length === 0) {
              resultContent = 'No images found.';
            } else {
              resultContent =
                `Found ${images.length} images:\n` +
                images.map(img => `- ${img.name} | URL: ${img.url}`).join('\n');
            }
          } catch (err) {
            resultContent = `Failed to browse images: ${
              err instanceof Error ? err.message : String(err)
            }`;
          }
        }

        if (block.name === 'save_marketing_plan') {
          const input = block.input as {
            week_start: string;
            posts: Array<{
              platform: 'linkedin' | 'instagram' | 'facebook';
              scheduled_date: string;
              scheduled_time: string;
              content: string;
              image_note?: string;
            }>;
          };
          try {
            const saved = await saveDraftPlan(
              input.posts.map(p => ({ ...p, week_start: input.week_start }))
            );
            resultContent = `Saved ${saved.length} posts as drafts for week of ${input.week_start}.\nPost IDs:\n${
              saved
                .map(
                  (p, i) =>
                    `${i + 1}. [${p.platform}] ${p.scheduled_date} ${p.scheduled_time} — ID: ${p.id}`
                )
                .join('\n')
            }`;
          } catch (err) {
            resultContent = `Failed to save plan: ${err instanceof Error ? err.message : String(err)}`;
          }
        }

        if (block.name === 'get_weekly_plan') {
          const input = block.input as { week_start?: string };
          const weekStart = input.week_start ?? getNextMonday();
          try {
            const posts = await getWeeklyPlan(weekStart);
            if (posts.length === 0) {
              resultContent = `No posts found for week of ${weekStart}.`;
            } else {
              resultContent = `Plan for week of ${weekStart} (${posts.length} posts):\n${
                posts
                  .map(
                    (p, i) =>
                      `${i + 1}. [${p.platform}] ${p.scheduled_date} ${p.scheduled_time} [${p.status}]\n   ID: ${p.id}\n   ${p.content.substring(0, 80)}...`
                  )
                  .join('\n\n')
              }`;
            }
          } catch (err) {
            resultContent = `Failed to get plan: ${err instanceof Error ? err.message : String(err)}`;
          }
        }

        if (block.name === 'approve_posts') {
          const input = block.input as {
            mode?: 'all';
            week_start?: string;
            post_ids?: string[];
          };
          try {
            if (input.mode === 'all' && input.week_start) {
              await approveAllDrafts(input.week_start);
              resultContent = `All draft posts for week of ${input.week_start} approved. They will publish automatically at their scheduled times.`;
            } else if (input.post_ids && input.post_ids.length > 0) {
              await Promise.all(input.post_ids.map(id => approvePost(id)));
              resultContent = `Approved ${input.post_ids.length} posts.`;
            } else {
              resultContent = 'No posts approved — provide mode: "all" with week_start, or a list of post_ids.';
            }
          } catch (err) {
            resultContent = `Failed to approve: ${err instanceof Error ? err.message : String(err)}`;
          }
        }

        if (block.name === 'reject_post') {
          const input = block.input as { post_id: string };
          try {
            await deletePost(input.post_id);
            resultContent = `Post ${input.post_id} removed from the plan.`;
          } catch (err) {
            resultContent = `Failed to reject post: ${err instanceof Error ? err.message : String(err)}`;
          }
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
