import Anthropic from '@anthropic-ai/sdk';
import { postToLinkedIn } from '@/lib/linkedin-poster';
import { postToFacebook, postToInstagram } from '@/lib/meta-poster';
import { loadHistory, saveMessage, clearHistory as clearDb } from '@/lib/chat-history';
import { listCloudinaryImages } from '@/lib/cloudinary';
import {
  replyToLinkedInComment,
  replyToFacebookComment,
  replyToInstagramComment,
  postLinkedInComment,
  postFacebookComment,
  postInstagramComment,
  markReplied,
  recordCommentReply,
  type CommentPostResult,
} from '@/lib/social-comments';
import {
  getFacebookPostEngagement,
  getInstagramPostEngagement,
  getLinkedInPostEngagement,
  getAllAccountStats,
  computeEngagementRate,
  type PostEngagement,
} from '@/lib/engagement';
import {
  saveDraftPlan,
  getWeeklyPlan,
  getPostById,
  approveAllDrafts,
  approvePost,
  deletePost,
  updatePost,
  getNextMonday,
  trackDirectPost,
  getPostedPostsForCommentCheck,
  type PostUpdate,
  type MarketingPost,
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
- **Comment replies** should match the language of the commenter — reply in Spanish if they wrote in Spanish, English if they wrote in English.
- **Thank-you comments and shoutout posts** must be in Spanish (Spain).
- **Conversations with the user are in English.**
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
- **Comment replies:** Warm, personal, on-brand. Thank commenters. Build intrigue. Never reveal details not yet public. **Vary your phrasing — never reuse the same opening line, thank-you phrase, or sentence structure across different comments.** Read what each commenter actually said and respond to that specifically, rather than a generic template. If your recent chat history shows replies you've already sent, deliberately write this one differently.
- **Thank-you comments:** Short, warm, genuine. E.g. "¡Gracias por vuestro apoyo! Os mantendremos informados 🙏"
- **Shoutout posts:** Celebratory, community-focused, builds further intrigue about AT Sevilla.

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
You have access to these proof points. **Spread them strategically across many posts over multiple weeks. Never use more than 1–2 of these data points in a single post, and never dump all of them in one week.**

- **Grupo Insur:** Breaking ground on new 4-star hotel in Nervión
- **El Corte Inglés:** Converting iconic Nervión building into a 10-floor hotel
- **Katégora:** Started construction of new aparthotel in the area
- **Urbanitae:** Successfully crowdfunded a hospitality project in Nervión
- **Market trend:** Nervión set to add 44+ new tourist accommodation units
- **Key narrative:** Nervión is transitioning from a purely commercial district into a mixed-use, hospitality-anchored urban destination.

---

## IMAGES — ALL PLATFORMS

**Every post should have an image.** Call browse_drive_images ONCE at the start to see all available images. When calling save_marketing_plan, set each post's image_url to the exact URL of the specific image you picked for it — pick a different, relevant image per post rather than reusing the same one. image_note is just a human-readable label for what the image shows; image_url is the real, clickable choice and is what the dashboard shows the user as "the image Pepe selected," so always set it.

---

## POSTING SCHEDULE — 5 POSTS PER BLOCK (SPAIN LOCAL TIME)

| # | Platform | Day | Time |
|---|----------|-----|------|
| 1 | Instagram | Monday | 18:00 |
| 2 | LinkedIn | Tuesday | 09:00 |
| 3 | Facebook | Tuesday | 12:00 |
| 4 | Instagram | Wednesday | 12:00 |
| 5 | LinkedIn | Thursday | 09:00 |

---

## HOW TO GENERATE A MARKETING PLAN

1. Use **${nextMonday}** as the week_start
2. Call browse_drive_images ONCE
3. Draft 5 posts in Spanish (Spain), picking a specific image_url for each from the browse_drive_images results
4. Choose at most 1 market intelligence proof point
5. Call save_marketing_plan with all 5 posts, each with its image_url set
6. Present the plan numbered 1–5 in English
7. End with: "Would you like to approve the full plan? Say *approve all* or let me know which posts to adjust."

## APPROVAL FLOW
- "approve all" → call approve_posts with mode "all" and week_start "${nextMonday}"
- "reject post 3" → call reject_post
- Edit request → update, re-save, re-ask. Check get_weekly_plan's Image field first — if one is already set (the user may have picked or changed it in the dashboard planner), carry that same image_url into the replacement post instead of picking a new one, unless the user's edit is specifically about the image.

## DELETING OR RESCHEDULING A SCHEDULED POST (anytime, not just right after drafting)
The user can ask to delete/remove/cancel a post, or move/reschedule its date or time, at any point — not only during the initial approval flow above, e.g. days later, about something already approved and sitting in the schedule. Look it up with get_weekly_plan to find its post_id, then call reject_post to delete it or reschedule_post to change its date/time (pass only the field(s) actually changing). Both only work on posts that haven't been published yet (draft, approved, or failed) — they'll fail with a clear reason if the post has already gone out, since a published post's record is tracked history and can't be changed. If that happens, tell the user it's already live and can't be modified.

## COMPARING TWO POSTS
If the user asks to compare two posts (e.g. "how did post 3 do vs post 5", "compare Monday's LinkedIn post with last week's"), find each one's internal post_id via get_weekly_plan, then call compare_posts with post_id_a and post_id_b. It returns each post's platform, schedule, caption preview, and full engagement stats (or "not posted yet" if either hasn't gone out). Narrate the comparison yourself — call out which one performed better and on what, don't just repeat the raw numbers back.

---

## TOOLS SUMMARY
- post_to_linkedin, post_to_facebook, post_to_instagram — publish posts
- browse_drive_images — list Cloudinary images (call ONCE per plan)
- save_marketing_plan, get_weekly_plan, approve_posts, reject_post, reschedule_post — plan management
- compare_posts — compare engagement between two posts
- reply_to_comment — reply to a specific comment
- post_comment — post a new top-level comment on a post (for thank-yous)
- get_engagement — fetch likes/comments/reach stats

You speak with authority and warmth. You are direct, strategic, and deeply passionate about the intersection of hospitality and real estate.`;
}

const tools: Anthropic.Tool[] = [
  {
    name: 'post_to_linkedin',
    description: 'Publishes a post to LinkedIn.',
    input_schema: {
      type: 'object' as const,
      properties: {
        content: { type: 'string' },
        image_url: { type: 'string' },
      },
      required: ['content'],
    },
  },
  {
    name: 'post_to_facebook',
    description: 'Publishes a post to the Grupo YAKGU Facebook Page.',
    input_schema: {
      type: 'object' as const,
      properties: {
        message: { type: 'string' },
        image_url: { type: 'string' },
      },
      required: ['message'],
    },
  },
  {
    name: 'post_to_instagram',
    description: 'Publishes an image post to Instagram. Requires image_url.',
    input_schema: {
      type: 'object' as const,
      properties: {
        caption: { type: 'string' },
        image_url: { type: 'string' },
      },
      required: ['caption', 'image_url'],
    },
  },
  {
    name: 'browse_drive_images',
    description: 'Lists all available images from Cloudinary. Call ONCE per plan.',
    input_schema: { type: 'object' as const, properties: {}, required: [] },
  },
  {
    name: 'save_marketing_plan',
    description: 'Saves a marketing plan to the database as drafts.',
    input_schema: {
      type: 'object' as const,
      properties: {
        week_start: { type: 'string', description: 'Monday date YYYY-MM-DD.' },
        posts: {
          type: 'array',
          items: {
            type: 'object',
            properties: {
              platform: { type: 'string', enum: ['linkedin', 'instagram', 'facebook'] },
              scheduled_date: { type: 'string' },
              scheduled_time: { type: 'string' },
              content: { type: 'string' },
              image_note: { type: 'string', description: 'Human-readable label for the image, e.g. "Nervión skyline at dusk".' },
              image_url: { type: 'string', description: 'The exact URL of the chosen image from browse_drive_images.' },
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
    description: 'Retrieves the saved marketing plan for a given week.',
    input_schema: {
      type: 'object' as const,
      properties: { week_start: { type: 'string' } },
      required: [],
    },
  },
  {
    name: 'approve_posts',
    description: 'Approves marketing posts for auto-publishing.',
    input_schema: {
      type: 'object' as const,
      properties: {
        mode: { type: 'string', enum: ['all'] },
        week_start: { type: 'string' },
        post_ids: { type: 'array', items: { type: 'string' } },
      },
      required: [],
    },
  },
  {
    name: 'reject_post',
    description:
      'Permanently deletes a post from the marketing plan — use this any time the user asks to delete, remove, cancel, or reject a scheduled post, not only right after a new plan is drafted. Only works on posts that have not been published yet (draft, approved, or failed); a post that has already been posted cannot be deleted, since it is live and its record is tracked history.',
    input_schema: {
      type: 'object' as const,
      properties: { post_id: { type: 'string' } },
      required: ['post_id'],
    },
  },
  {
    name: 'reschedule_post',
    description:
      'Changes the scheduled date and/or time of an existing post in the marketing plan — use this any time the user asks to move, reschedule, or change the timing of a post. Provide scheduled_date and/or scheduled_time (only the ones being changed). Only works on posts that have not been published yet (draft, approved, or failed); a post that has already been posted cannot be rescheduled.',
    input_schema: {
      type: 'object' as const,
      properties: {
        post_id: { type: 'string' },
        scheduled_date: { type: 'string', description: 'New date, YYYY-MM-DD.' },
        scheduled_time: { type: 'string', description: 'New time, 24-hour HH:MM, Spain local time.' },
      },
      required: ['post_id'],
    },
  },
  {
    name: 'reply_to_comment',
    description: 'Posts a reply to a specific comment on LinkedIn, Instagram, or Facebook.',
    input_schema: {
      type: 'object' as const,
      properties: {
        platform: { type: 'string', enum: ['linkedin', 'instagram', 'facebook'] },
        comment_id: { type: 'string' },
        post_id: { type: 'string', description: 'Required for LinkedIn.' },
        reply_text: { type: 'string' },
      },
      required: ['platform', 'comment_id', 'reply_text'],
    },
  },
  {
    name: 'post_comment',
    description: 'Posts a new top-level comment on one of your own posts (e.g. a thank-you when a post gets many likes).',
    input_schema: {
      type: 'object' as const,
      properties: {
        platform: { type: 'string', enum: ['linkedin', 'instagram', 'facebook'] },
        post_id: { type: 'string', description: 'The platform post ID to comment on.' },
        text: { type: 'string', description: 'The comment text. Write in Spanish (Spain).' },
      },
      required: ['platform', 'post_id', 'text'],
    },
  },
  {
    name: 'get_engagement',
    description: 'Fetches engagement stats for recent posts and follower counts across all platforms.',
    input_schema: {
      type: 'object' as const,
      properties: {
        post_id: { type: 'string' },
        platform: { type: 'string', enum: ['linkedin', 'instagram', 'facebook'] },
      },
      required: [],
    },
  },
  {
    name: 'compare_posts',
    description:
      'Compares engagement between two posts from the marketing plan, side by side (likes, comments, shares, impressions, reach, engagement rate). Use the internal post_id from get_weekly_plan for each — not the platform post ID. Only posts that have actually been posted have engagement data; if either post hasn\'t been published yet, say so instead of comparing.',
    input_schema: {
      type: 'object' as const,
      properties: {
        post_id_a: { type: 'string' },
        post_id_b: { type: 'string' },
      },
      required: ['post_id_a', 'post_id_b'],
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
      await saveMessage(chatId, BOT_NAME, 'assistant', response.content);
      const toolResults: Anthropic.ToolResultBlockParam[] = [];

      for (const block of response.content) {
        if (block.type !== 'tool_use') continue;
        let resultContent = '';

        if (block.name === 'post_to_linkedin') {
          const input = block.input as { content: string; image_url?: string };
          const result = await postToLinkedIn(input.content, input.image_url);
          if (result.success && result.postId) await trackDirectPost('linkedin', result.postId);
          resultContent = result.success ? `Posted to LinkedIn!${result.url ? ` URL: ${result.url}` : ''}` : `Failed: ${result.error}`;
        }

        if (block.name === 'post_to_facebook') {
          const input = block.input as { message: string; image_url?: string };
          const result = await postToFacebook(input.message, input.image_url);
          if (result.success && result.postId) await trackDirectPost('facebook', result.postId);
          resultContent = result.success ? `Posted to Facebook!${result.url ? ` URL: ${result.url}` : ''}` : `Failed: ${result.error}`;
        }

        if (block.name === 'post_to_instagram') {
          const input = block.input as { caption: string; image_url: string };
          const result = await postToInstagram(input.caption, input.image_url);
          if (result.success && result.postId) await trackDirectPost('instagram', result.postId);
          resultContent = result.success ? `Posted to Instagram!${result.url ? ` URL: ${result.url}` : ''}` : `Failed: ${result.error}`;
        }

        if (block.name === 'browse_drive_images') {
          try {
            const images = await listCloudinaryImages();
            resultContent = images.length === 0
              ? 'No images found in Cloudinary.'
              : `Found ${images.length} images:\n` + images.map(img => `- ${img.name} | URL: ${img.url}`).join('\n');
          } catch (err) {
            resultContent = `Failed to browse images: ${err instanceof Error ? err.message : String(err)}`;
          }
        }

        if (block.name === 'save_marketing_plan') {
          const input = block.input as {
            week_start: string;
            posts: Array<{ platform: 'linkedin' | 'instagram' | 'facebook'; scheduled_date: string; scheduled_time: string; content: string; image_note?: string; image_url?: string }>;
          };
          try {
            const saved = await saveDraftPlan(input.posts.map(p => ({ ...p, week_start: input.week_start })));
            resultContent = `Saved ${saved.length} posts as drafts for week of ${input.week_start}.\nPost IDs:\n${
              saved.map((p, i) => `${i + 1}. [${p.platform}] ${p.scheduled_date} ${p.scheduled_time} — ID: ${p.id}`).join('\n')
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
            resultContent = posts.length === 0
              ? `No posts found for week of ${weekStart}.`
              : `Plan for week of ${weekStart} (${posts.length} posts):\n${
                  posts.map((p, i) => `${i + 1}. [${p.platform}] ${p.scheduled_date} ${p.scheduled_time} [${p.status}]\n   ID: ${p.id}\n   Image: ${p.image_url ?? '(none selected — the user may have picked or changed this in the dashboard planner)'}\n   ${p.content.substring(0, 80)}...`).join('\n\n')
                }`;
          } catch (err) {
            resultContent = `Failed to get plan: ${err instanceof Error ? err.message : String(err)}`;
          }
        }

        if (block.name === 'approve_posts') {
          const input = block.input as { mode?: 'all'; week_start?: string; post_ids?: string[] };
          try {
            if (input.mode === 'all' && input.week_start) {
              await approveAllDrafts(input.week_start);
              resultContent = `All draft posts for week of ${input.week_start} approved.`;
            } else if (input.post_ids?.length) {
              await Promise.all(input.post_ids.map(id => approvePost(id)));
              resultContent = `Approved ${input.post_ids.length} posts.`;
            } else {
              resultContent = 'No posts approved — provide mode "all" with week_start, or a list of post_ids.';
            }
          } catch (err) {
            resultContent = `Failed to approve: ${err instanceof Error ? err.message : String(err)}`;
          }
        }

        if (block.name === 'reject_post') {
          const input = block.input as { post_id: string };
          try {
            await deletePost(input.post_id);
            resultContent = `Post ${input.post_id} removed.`;
          } catch (err) {
            resultContent = `Failed: ${err instanceof Error ? err.message : String(err)}`;
          }
        }

        if (block.name === 'reschedule_post') {
          const input = block.input as { post_id: string; scheduled_date?: string; scheduled_time?: string };
          try {
            const fields: PostUpdate = {};
            if (input.scheduled_date) fields.scheduled_date = input.scheduled_date;
            if (input.scheduled_time) fields.scheduled_time = input.scheduled_time;
            if (Object.keys(fields).length === 0) {
              resultContent = 'Provide at least a new scheduled_date or scheduled_time.';
            } else {
              const post = await updatePost(input.post_id, fields);
              resultContent = `Post ${post.id} rescheduled to ${post.scheduled_date} ${post.scheduled_time}.`;
            }
          } catch (err) {
            resultContent = `Failed: ${err instanceof Error ? err.message : String(err)}`;
          }
        }

        if (block.name === 'reply_to_comment') {
          const input = block.input as { platform: 'linkedin' | 'instagram' | 'facebook'; comment_id: string; post_id?: string; reply_text: string };
          try {
            let result: CommentPostResult = { success: false };
            if (input.platform === 'linkedin' && input.post_id) result = await replyToLinkedInComment(input.post_id, input.comment_id, input.reply_text);
            else if (input.platform === 'facebook') result = await replyToFacebookComment(input.comment_id, input.reply_text);
            else if (input.platform === 'instagram') result = await replyToInstagramComment(input.comment_id, input.reply_text);
            if (result.success) {
              // Mark the comment we replied to so it's never answered again, and — since our own
              // reply can itself reappear as a "comment" on the next poll — mark it too, so the bot
              // never mistakes its own reply for a new one requiring a response.
              await markReplied(input.comment_id, input.platform);
              if (result.commentId) await markReplied(result.commentId, input.platform);
              await recordCommentReply(input.platform, input.comment_id, input.reply_text);
            }
            resultContent = result.success ? `Reply posted on ${input.platform}.` : `Failed to post reply on ${input.platform}.`;
          } catch (err) {
            resultContent = `Error: ${err instanceof Error ? err.message : String(err)}`;
          }
        }

        if (block.name === 'post_comment') {
          const input = block.input as { platform: 'linkedin' | 'instagram' | 'facebook'; post_id: string; text: string };
          try {
            let result: CommentPostResult = { success: false };
            if (input.platform === 'linkedin') result = await postLinkedInComment(input.post_id, input.text);
            else if (input.platform === 'facebook') result = await postFacebookComment(input.post_id, input.text);
            else if (input.platform === 'instagram') result = await postInstagramComment(input.post_id, input.text);
            // Mark our own top-level comment as handled so a later poll doesn't treat it as a new,
            // unanswered comment and reply to it.
            if (result.success && result.commentId) await markReplied(result.commentId, input.platform);
            resultContent = result.success ? `Comment posted on ${input.platform}.` : `Failed to post comment on ${input.platform}.`;
          } catch (err) {
            resultContent = `Error: ${err instanceof Error ? err.message : String(err)}`;
          }
        }

        if (block.name === 'get_engagement') {
          const input = block.input as { post_id?: string; platform?: 'linkedin' | 'instagram' | 'facebook' };
          try {
            if (input.post_id && input.platform) {
              let eng = null;
              if (input.platform === 'facebook') eng = await getFacebookPostEngagement(input.post_id);
              else if (input.platform === 'instagram') eng = await getInstagramPostEngagement(input.post_id);
              else if (input.platform === 'linkedin') eng = await getLinkedInPostEngagement(input.post_id);
              resultContent = eng
                ? `[${eng.platform}] Likes: ${eng.likes} | Comments: ${eng.comments} | Shares: ${eng.shares} | Impressions: ${eng.impressions} | Reach: ${eng.reach}`
                : 'No data available.';
            } else {
              const [posts, accountStats] = await Promise.all([getPostedPostsForCommentCheck(), getAllAccountStats()]);
              const engagements = await Promise.all(posts.map(async p => {
                try {
                  if (p.platform === 'facebook') return getFacebookPostEngagement(p.platform_post_id);
                  if (p.platform === 'instagram') return getInstagramPostEngagement(p.platform_post_id);
                  if (p.platform === 'linkedin') return getLinkedInPostEngagement(p.platform_post_id);
                } catch {}
                return null;
              }));
              const valid = engagements.filter(Boolean);
              const statsLine = accountStats.map(s => `${s.platform}: ${s.followers} followers`).join(' | ');
              const postLines = valid.map(e => `[${e!.platform}] Likes: ${e!.likes} | Comments: ${e!.comments} | Shares: ${e!.shares} | Impressions: ${e!.impressions} | Reach: ${e!.reach}`).join('\n');
              resultContent = `Account stats: ${statsLine}\n\nPost engagement (last 7 days):\n${postLines || 'No data.'}`;
            }
          } catch (err) {
            resultContent = `Failed: ${err instanceof Error ? err.message : String(err)}`;
          }
        }

        if (block.name === 'compare_posts') {
          const input = block.input as { post_id_a: string; post_id_b: string };
          try {
            const [postA, postB] = await Promise.all([getPostById(input.post_id_a), getPostById(input.post_id_b)]);
            if (!postA || !postB) {
              resultContent = 'One or both post IDs were not found.';
            } else {
              const describe = async (post: MarketingPost): Promise<string> => {
                const label = `[${post.platform}] ${post.scheduled_date} ${post.scheduled_time} — "${post.content.substring(0, 60)}..."`;
                if (post.status !== 'posted' || !post.platform_post_id) {
                  return `${label}\n  Not posted yet — no engagement data.`;
                }
                let eng: PostEngagement | null = null;
                if (post.platform === 'facebook') eng = await getFacebookPostEngagement(post.platform_post_id);
                else if (post.platform === 'instagram') eng = await getInstagramPostEngagement(post.platform_post_id);
                else if (post.platform === 'linkedin') eng = await getLinkedInPostEngagement(post.platform_post_id);
                if (!eng) return `${label}\n  No engagement data available.`;
                const rate = computeEngagementRate(eng);
                return `${label}\n  Likes: ${eng.likes} | Comments: ${eng.comments} | Shares: ${eng.shares} | Impressions: ${eng.impressions} | Reach: ${eng.reach} | Engagement rate: ${rate.toFixed(2)}%`;
              };
              const [descA, descB] = await Promise.all([describe(postA), describe(postB)]);
              resultContent = `POST A:\n${descA}\n\nPOST B:\n${descB}`;
            }
          } catch (err) {
            resultContent = `Failed: ${err instanceof Error ? err.message : String(err)}`;
          }
        }

        toolResults.push({ type: 'tool_result', tool_use_id: block.id, content: resultContent });
      }

      history.push({ role: 'user', content: toolResults });
      await saveMessage(chatId, BOT_NAME, 'user', toolResults);
      continue;
    }

    const textBlock = response.content.find(b => b.type === 'text');
    if (!textBlock || textBlock.type !== 'text') throw new Error('No text response');
    const reply = textBlock.text;
    await saveMessage(chatId, BOT_NAME, 'assistant', reply);
    return reply;
  }
}
