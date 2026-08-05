import Anthropic from '@anthropic-ai/sdk';
import { postToLinkedIn } from '@/lib/linkedin-poster';
import { postToFacebook, postToInstagram, postInstagramStory, postFacebookStory } from '@/lib/meta-poster';
import { loadHistory, saveMessage, clearHistory as clearDb } from '@/lib/chat-history';
import { listCloudinaryImages } from '@/lib/cloudinary';
import { findUploadsByName } from '@/lib/cloudinary-uploads';
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
  getTopPerformingPosts,
  type PostEngagement,
  type PerformanceMetric,
} from '@/lib/engagement';
import {
  saveDraftPlan,
  getWeeklyPlan,
  getPlanByDateRange,
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
import { searchHashtag, getTrackedHashtagStats, addTrackedHashtag } from '@/lib/instagram-hashtags';
import { publishPost } from '@/lib/publish-post';
import { createVideo, listAvatars, listVoices } from '@/lib/heygen';
import { createVideoJob } from '@/lib/video-jobs';

const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
const BOT_NAME = 'pepe';

// A hung external call (Meta, HeyGen, Cloudinary, Supabase — none of which have
// their own timeouts) previously blocked a tool_use block until Vercel's hard
// maxDuration killed the function mid-await, which skips every JS catch block
// (nothing runs during a SIGKILL) and leaves that tool_use without a
// tool_result. That permanently corrupts the conversation, since Claude's API
// then rejects every future message referencing this history. Racing each
// tool dispatch against this timeout guarantees SOME result — even a timeout
// error — is always produced well before that hard limit, regardless of what
// hangs inside.
const TOOL_TIMEOUT_MS = 45_000;

function withTimeout<T>(promise: Promise<T>, ms: number, label: string): Promise<T> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(`Tool "${label}" timed out after ${ms}ms`)), ms);
    promise.then(
      value => { clearTimeout(timer); resolve(value); },
      err => { clearTimeout(timer); reject(err); }
    );
  });
}

// Shared by get_weekly_plan and get_plan_by_date — both list plan posts the
// same way, just scoped differently (a Monday-aligned week vs. an arbitrary
// date/range).
function formatPlanPosts(posts: MarketingPost[]): string {
  return posts.map((p, i) => {
    const images = (p.image_urls?.length ? p.image_urls : p.image_url ? [p.image_url] : []);
    const imageLine = images.length === 0
      ? '(none selected — the user may have picked or changed this in the dashboard planner)'
      : images.length === 1 ? images[0] : `${images.length} images (carousel): ${images.join(', ')}`;
    return `${i + 1}. [${p.platform}] ${p.scheduled_date} ${p.scheduled_time} [${p.status}]\n   ID: ${p.id}\n   Image: ${imageLine}\n   ${p.content}`;
  }).join('\n\n');
}

function buildSystemPrompt(): string {
  const today = new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Madrid' }).format(new Date());
  const nextMonday = getNextMonday();

  return `You are Pepe, a highly experienced marketing expert with 25+ years in real estate development focused on the hotel and hospitality ecosystem. Your background spans luxury resorts, boutique hotels, eco-lodges, mixed-use developments, and hospitality-anchored real estate projects across Latin America and Europe.

---

## YOUR TEAMMATES
You share this Telegram group with two other bots — you're the only one of the three focused on marketing, so stay in your lane and point people to the right one instead of trying to cover their ground yourself:
- **Santi** — CTO. Reads and writes the actual code for this app, opens and merges pull requests. If someone needs a bug fixed or a feature built, that's him, not you.
- **Angeles** — CPO. Advises on product strategy, UX, and roadmap (PRDs, user flows, prioritization) — no code access. If a request is really about product/UX direction rather than marketing content, that's her.

You only ever see a message here if it was addressed to you (or wasn't addressed to anyone in particular) — mentioning Santi or Angeles by name in your own reply doesn't ping them; the user has to address them directly for that.

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

**Every post should have an image.** Call browse_drive_images ONCE at the start to see all available images. When calling save_marketing_plan, set each post's image_urls to the exact URL of the specific image you picked for it, as a single-item array — pick a different, relevant image per post rather than reusing the same one. Only put more than one URL in image_urls if the user specifically asked for a carousel/multi-image post. image_note is just a human-readable label for what the image shows; image_urls is the real, clickable choice and is what the dashboard shows the user as "the image Pepe selected," so always set it.

If the user instead refers to an image by a custom name they gave it earlier (e.g. "use the sunset image I uploaded") rather than picking from what browse_drive_images shows, call find_named_image instead — that's how images uploaded through your Telegram "upload" flow are found, since browse_drive_images only surfaces Cloudinary filenames, not the names users gave them.

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
3. Draft 5 posts in Spanish (Spain), picking one specific image for each from the browse_drive_images results (image_urls with a single URL) — only use multiple images/a carousel if the user specifically asked for one
4. Choose at most 1 market intelligence proof point
5. Call save_marketing_plan with all 5 posts, each with its image_urls set
6. Present the plan numbered 1–5 in English
7. End with: "Would you like to approve the full plan? Say *approve all* or let me know which posts to adjust."

## APPROVAL FLOW
- "approve all" → call approve_posts with mode "all" and week_start "${nextMonday}"
- "reject post 3" → call reject_post
- Edit request → update, re-save, re-ask. Check get_weekly_plan's Image field first — if one is already set (the user may have picked or changed it in the dashboard planner), carry those same image_urls into the replacement post instead of picking a new one, unless the user's edit is specifically about the image.

## DELETING, RESCHEDULING, OR EDITING A SCHEDULED POST (anytime, not just right after drafting)
The user can ask to delete/remove/cancel a post, move/reschedule its date or time, or edit its wording (e.g. "remove the hashtags", "shorten that caption", "drop the last sentence"), at any point — not only during the initial approval flow above, e.g. days later, about something already approved and sitting in the schedule. Look it up first:
- The user names a whole week (or you're checking the plan you just drafted) → get_weekly_plan.
- The user names or implies ANY specific day instead of a week — an explicit date ("the 15th"), a range ("between the 10th and 14th"), or a **relative day word: "today", "tomorrow", "yesterday", "this Monday"** — → get_plan_by_date, resolving the relative word yourself against today's date (${today}) before calling it. **Never call get_weekly_plan with no arguments to answer a "today" question** — with no week_start it defaults to next week's Monday (the fresh-planning-week default), which silently skips the current week entirely whenever today itself happens to be a Monday, making it look like nothing is scheduled today even when something is.

Once you've found the post_id and current content, call reject_post to delete it, reschedule_post to change its date/time (pass only the field(s) actually changing), or edit_post to change its text — for edit_post, apply the requested change to the existing content yourself and pass the FULL new caption, not just a diff or instruction. All three only work on posts that haven't been published yet (draft, approved, or failed) — they'll fail with a clear reason if the post has already gone out, since a published post's record is tracked history and can't be changed. If that happens, tell the user it's already live and can't be modified.

## COMPARING TWO POSTS
If the user asks to compare two posts (e.g. "how did post 3 do vs post 5", "compare Monday's LinkedIn post with last week's"), find each one's internal post_id via get_weekly_plan or get_plan_by_date, then call compare_posts with post_id_a and post_id_b. It returns each post's platform, schedule, caption preview, and full engagement stats (or "not posted yet" if either hasn't gone out). Narrate the comparison yourself — call out which one performed better and on what, don't just repeat the raw numbers back.

## TOP / BEST-PERFORMING POSTS
For "which post got the most likes", "top 5 posts by impressions", "what's our best performing content", or anything else ranking posts rather than comparing two named ones, call get_top_posts with the metric the user cares about (likes, comments, shares, impressions, reach, or engagement_rate — defaults to likes) and a platform filter if they named one. This ranks across the full posting history, not just a recent window. Narrate the ranking yourself — name what stands out about the top post(s), don't just dump the numbers back.

---

## TOOLS SUMMARY
- post_to_linkedin, post_to_facebook, post_to_instagram — publish posts
- post_instagram_story, post_facebook_story — publish to Stories (24h, ephemeral, image only, no caption)
- browse_drive_images — list Cloudinary images (call ONCE per plan)
- find_named_image — look up an image by the custom name the user gave it after uploading it to you
- save_marketing_plan, get_weekly_plan, get_plan_by_date, approve_posts, reject_post, reschedule_post, retry_post, edit_post — plan management. get_plan_by_date looks up a specific date or range instead of a Monday-aligned week.
- compare_posts — compare engagement between two named posts
- get_top_posts — rank all published posts by likes/comments/shares/impressions/reach/engagement_rate
- reply_to_comment — reply to a specific comment
- post_comment — post a new top-level comment on a post (for thank-yous)
- get_engagement — fetch likes/comments/reach stats
- search_hashtag — look up an Instagram hashtag's engagement stats (avg likes/comments, top posts) for content research. Read-only: there is no way to comment on or otherwise interact with posts this surfaces — never suggest that as an option. Each call is a real network round-trip — check at most 3-4 hashtags per message; if asked to check more, do a batch of a few, report back, and continue with the rest in a follow-up message rather than calling it a dozen+ times in one turn (risks a timeout that can corrupt the conversation).
- create_video, list_video_avatars — generate an AI avatar video (HeyGen) and auto-post it once ready; only when explicitly asked, never proactively as part of routine planning
- get_tracked_hashtags — see the user's tracked hashtag list with cached stats (same as the /hashtags dashboard)
- add_tracked_hashtag — add a hashtag you've found worth tracking to that list, so the user sees it in the dashboard too

You speak with authority and warmth. You are direct, strategic, and deeply passionate about the intersection of hospitality and real estate.`;
}

const tools: Anthropic.Tool[] = [
  {
    name: 'post_to_linkedin',
    description:
      'Publishes a post to LinkedIn. Pass one URL in image_urls for a single-image post, or 2+ URLs for a multi-image post — LinkedIn displays multiple images as a gallery on the same post. Uses the normal posting app by default — only set via_community_management to true if the user explicitly asks to post/test via the Community Management app/credentials specifically.',
    input_schema: {
      type: 'object' as const,
      properties: {
        content: { type: 'string' },
        image_urls: { type: 'array', items: { type: 'string' }, description: 'One URL for a single image, multiple for a multi-image post.' },
        via_community_management: {
          type: 'boolean',
          description: 'Set true only when the user explicitly asks to post via the Community Management app instead of the normal posting app.',
        },
      },
      required: ['content'],
    },
  },
  {
    name: 'post_to_facebook',
    description:
      'Publishes a post to the Grupo YAKGU Facebook Page. Pass one URL in image_urls for a single-photo post, or 2+ URLs for a multi-photo post (all photos attached to the same post).',
    input_schema: {
      type: 'object' as const,
      properties: {
        message: { type: 'string' },
        image_urls: { type: 'array', items: { type: 'string' }, description: 'One URL for a single photo, multiple for a multi-photo post.' },
      },
      required: ['message'],
    },
  },
  {
    name: 'post_to_instagram',
    description:
      'Publishes an image post to Instagram. Requires image_urls with at least one URL. Pass 2+ URLs (max 10) for a carousel — a single swipeable post containing all of them, not separate posts.',
    input_schema: {
      type: 'object' as const,
      properties: {
        caption: { type: 'string' },
        image_urls: { type: 'array', items: { type: 'string' }, description: 'One URL for a single image, 2–10 for a carousel.' },
      },
      required: ['caption', 'image_urls'],
    },
  },
  {
    name: 'post_instagram_story',
    description:
      'Posts an image to Instagram Stories (24h ephemeral, not the feed). Requires image_url. Stories cannot have a caption via the API — the image is posted as-is.',
    input_schema: {
      type: 'object' as const,
      properties: {
        image_url: { type: 'string' },
      },
      required: ['image_url'],
    },
  },
  {
    name: 'post_facebook_story',
    description:
      'Posts an image to Facebook Page Stories (24h ephemeral, not the feed). Requires image_url. Meta restricts this API heavily for third-party apps, so this may fail with a permissions error even when everything else is configured correctly — tell the user plainly if it fails rather than retrying.',
    input_schema: {
      type: 'object' as const,
      properties: {
        image_url: { type: 'string' },
      },
      required: ['image_url'],
    },
  },
  {
    name: 'browse_drive_images',
    description: 'Lists all available images from Cloudinary. Call ONCE per plan.',
    input_schema: { type: 'object' as const, properties: {}, required: [] },
  },
  {
    name: 'find_named_image',
    description:
      'Looks up an image the user uploaded to Cloudinary through you and gave a custom name to (via the Telegram "upload" flow — you asked what to call it right after the upload, and they replied with a name). Use this whenever the user refers to an image by that name (e.g. "use the sunset image", "post the one I called poolside") instead of browse_drive_images, which only shows filenames, not custom names. Matches case-insensitively as a substring, so a partial name works. Returns each match\'s URL, folder, and when it was uploaded — if more than one matches, ask the user which one they mean rather than guessing.',
    input_schema: {
      type: 'object' as const,
      properties: {
        name: { type: 'string', description: 'The name (or part of it) the user gave the image.' },
      },
      required: ['name'],
    },
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
              image_urls: {
                type: 'array',
                items: { type: 'string' },
                description: 'Exact URL(s) of the chosen image(s) from browse_drive_images. One image is the default; only include multiple if the user specifically asked for a carousel/multi-image post.',
              },
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
    name: 'get_plan_by_date',
    description:
      'Retrieves plan posts for a specific date or date range — use this (instead of get_weekly_plan) whenever the user asks about a particular day rather than a whole week, e.g. "what\'s scheduled for August 15th" or "show me everything between the 10th and the 14th". Not limited to a Monday-aligned week and returns posts of any status (draft, approved, posted, failed), across all platforms. Use the returned post_id with reject_post/reschedule_post/edit_post to act on a specific post found this way.',
    input_schema: {
      type: 'object' as const,
      properties: {
        date: { type: 'string', description: 'Start date, YYYY-MM-DD. For a single day, this is the only date needed.' },
        date_to: { type: 'string', description: 'Optional end date (inclusive), YYYY-MM-DD, for a range. Omit for a single day.' },
      },
      required: ['date'],
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
    name: 'retry_post',
    description:
      'Publishes an existing marketing plan post right now, using whatever content, image, and platform are already saved on it — use this when a scheduled post failed to publish and the user wants it retried or posted immediately, without redrafting it. Refuses if the post has already been posted.',
    input_schema: {
      type: 'object' as const,
      properties: { post_id: { type: 'string' } },
      required: ['post_id'],
    },
  },
  {
    name: 'edit_post',
    description:
      'Rewrites the caption/content of an existing marketing plan post — use this any time the user asks to change the wording, remove hashtags, shorten it, fix a typo, or otherwise edit the text of a scheduled post. Pass the full new content, not just the changed part — this replaces the post\'s content entirely. Only works on posts that have not been published yet (draft, approved, or failed); a post that has already been posted cannot be edited.',
    input_schema: {
      type: 'object' as const,
      properties: {
        post_id: { type: 'string' },
        content: { type: 'string', description: 'The full replacement caption/content for the post.' },
      },
      required: ['post_id', 'content'],
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
  {
    name: 'get_top_posts',
    description:
      'Ranks published posts by a performance metric — use this for "which post did best", "top 5 by likes/impressions/etc.", or any question about the best/worst performing content across the full history (not just a recent window). Defaults to top 5 by likes across all platforms; narrow with platform and/or limit as needed.',
    input_schema: {
      type: 'object' as const,
      properties: {
        metric: { type: 'string', enum: ['likes', 'comments', 'shares', 'impressions', 'reach', 'engagement_rate'], description: 'Defaults to "likes".' },
        platform: { type: 'string', enum: ['linkedin', 'instagram', 'facebook'], description: 'Omit to rank across all platforms.' },
        limit: { type: 'number', description: 'How many posts to return. Defaults to 5.' },
      },
      required: [],
    },
  },
  {
    name: 'create_video',
    description:
      'Generates an AI avatar video from a text script via HeyGen, then automatically uploads it to Cloudinary and posts it to Instagram or Facebook once ready. Generation and posting run in the background and can take several minutes — this call only starts the process and returns immediately; the user gets a Telegram message here when it actually finishes (posted or failed), so tell them it is running rather than that it is done. Uses a fixed default avatar/voice unless avatar_id/voice_id are given — use list_video_avatars first if the user wants to pick a specific one.',
    input_schema: {
      type: 'object' as const,
      properties: {
        script: { type: 'string', description: 'What the avatar should say in the video.' },
        platform: { type: 'string', enum: ['instagram', 'facebook'] },
        caption: { type: 'string', description: 'Caption for the resulting post.' },
        avatar_id: { type: 'string', description: 'Optional — overrides the default HeyGen avatar.' },
        voice_id: { type: 'string', description: 'Optional — overrides the default HeyGen voice.' },
      },
      required: ['script', 'platform', 'caption'],
    },
  },
  {
    name: 'list_video_avatars',
    description: 'Lists available HeyGen avatars and voices — use when the user wants to pick one for create_video instead of using the default.',
    input_schema: { type: 'object' as const, properties: {}, required: [] },
  },
  {
    name: 'search_hashtag',
    description:
      'Looks up an Instagram hashtag and returns engagement stats from its current top-performing public posts (posts sampled, average likes, average comments, top post previews) — for content and trend research only. There is no way to comment on, follow, or otherwise interact with any post this returns; use it purely to inform what to post next, never to suggest engaging with the posts found.',
    input_schema: {
      type: 'object' as const,
      properties: {
        hashtag: { type: 'string', description: 'Hashtag without the # symbol, e.g. "inmobiliariasevilla".' },
      },
      required: ['hashtag'],
    },
  },
  {
    name: 'get_tracked_hashtags',
    description: 'Returns the user\'s tracked hashtag list with each one\'s cached stats (posts sampled, avg likes/comments) — the same list and data shown on the /hashtags dashboard page.',
    input_schema: { type: 'object' as const, properties: {}, required: [] },
  },
  {
    name: 'add_tracked_hashtag',
    description: 'Adds a hashtag to the tracked list shown on the /hashtags dashboard page, fetching its stats immediately. Use this once you have explored and found a hashtag genuinely worth tracking going forward — not for every hashtag checked via search_hashtag, only ones worth adding permanently.',
    input_schema: {
      type: 'object' as const,
      properties: {
        hashtag: { type: 'string', description: 'Hashtag without the # symbol.' },
      },
      required: ['hashtag'],
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
    const turnStartedAt = Date.now();
    // Wrapped like every tool call below, for the same SIGKILL-avoidance
    // reason: the SDK's default maxRetries (2) means an unwrapped call can
    // silently retry for timeout*(1+maxRetries) before ever rejecting —
    // past this route's 300s maxDuration, so Vercel kills the whole
    // function with nothing logged and no reply ever sent, instead of the
    // call throwing in time for the route's own try/catch to tell the user
    // something went wrong.
    //
    // Both the per-attempt SDK timeout and this outer ceiling need to be
    // long enough for a single heavy-generation turn to actually finish —
    // confirmed on Santi's identical call in lib/dev-agent.ts: a turn
    // composing a lot of real output legitimately ran past the original
    // 120s/150s pair and got cut off mid-generation even though nothing was
    // stuck. The outer ceiling stays comfortably below this route's 300s
    // maxDuration so a *genuinely* hung call still fails fast enough for
    // the route to reply instead of going silent.
    const response = await withTimeout(
      client.messages.create(
        {
          model: 'claude-sonnet-4-6',
          max_tokens: 8192,
          system: buildSystemPrompt(),
          tools,
          messages: history,
        },
        { timeout: 200_000, maxRetries: 1 }
      ),
      220_000,
      'anthropic messages.create'
    );
    console.log(`[marketing-agent] anthropic turn (${Date.now() - turnStartedAt}ms), stop_reason: ${response.stop_reason}`);

    // Gate on the presence of a tool_use block, not on stop_reason === 'tool_use'
    // — a turn that runs out of max_tokens mid-generation reports stop_reason
    // 'max_tokens' even when it already emitted one or more *complete*
    // tool_use blocks earlier in the same response (Anthropic only ever
    // returns fully-formed content blocks; one still mid-generation at
    // truncation is simply omitted, never returned malformed). Gating on the
    // exact stop_reason would silently discard an already-completed action
    // (e.g. a successful post_to_linkedin) just because a later, unrelated
    // block in the same turn ran out of room.
    const hasToolUse = response.content.some(b => b.type === 'tool_use');
    if (hasToolUse) {
      history.push({ role: 'assistant', content: response.content });
      await saveMessage(chatId, BOT_NAME, 'assistant', response.content);
      const toolResults: Anthropic.ToolResultBlockParam[] = [];

      for (const block of response.content) {
        if (block.type !== 'tool_use') continue;
        let resultContent = '';

        // Outer safety net: every tool_use block MUST get a matching
        // tool_result, or Claude's API rejects every later message in this
        // chat with "tool_use ids were found without tool_result blocks" —
        // permanently, since the broken history gets resent every time. This
        // has actually happened (a batch of hashtag lookups left several
        // dangling, and — since no external fetch() in this codebase carries
        // its own timeout — a single hung call blocking past Vercel's hard
        // maxDuration, which SIGKILLs the function mid-await and skips this
        // catch entirely). Individual handlers below have their own try/catch
        // for a cleaner error message; the withTimeout race below guarantees
        // a result is always produced well before that hard limit even if a
        // handler hangs; this outer catch guarantees one even for a bug in a
        // handler that doesn't.
        const toolStartedAt = Date.now();
        console.log(`[marketing-agent] tool start: ${block.name}`, JSON.stringify(block.input).slice(0, 500));
        try {
          await withTimeout((async () => {
        if (block.name === 'post_to_linkedin') {
          const input = block.input as { content: string; image_urls?: string[]; via_community_management?: boolean };
          let credentials: { token: string; authorId: string } | undefined;
          if (input.via_community_management) {
            const token = process.env.LINKEDIN_ACCESS_TOKEN_COMM;
            const authorId = process.env.LINKEDIN_AUTHOR_ID_COMM;
            if (!token || !authorId) {
              resultContent = 'Failed: LINKEDIN_ACCESS_TOKEN_COMM or LINKEDIN_AUTHOR_ID_COMM not configured.';
            }
            credentials = token && authorId ? { token, authorId } : undefined;
          }
          if (!resultContent) {
            const result = await postToLinkedIn(input.content, input.image_urls, credentials);
            if (result.success && result.postId) await trackDirectPost('linkedin', result.postId);
            resultContent = result.success
              ? `Posted to LinkedIn${input.via_community_management ? ' via the Community Management app' : ''}!${result.url ? ` URL: ${result.url}` : ''}`
              : `Failed: ${result.error}`;
          }
        }

        if (block.name === 'post_to_facebook') {
          const input = block.input as { message: string; image_urls?: string[] };
          const result = await postToFacebook(input.message, input.image_urls);
          if (result.success && result.postId) await trackDirectPost('facebook', result.postId);
          resultContent = result.success ? `Posted to Facebook!${result.url ? ` URL: ${result.url}` : ''}` : `Failed: ${result.error}`;
        }

        if (block.name === 'post_to_instagram') {
          const input = block.input as { caption: string; image_urls: string[] };
          const result = await postToInstagram(input.caption, input.image_urls);
          if (result.success && result.postId) await trackDirectPost('instagram', result.postId);
          resultContent = result.success ? `Posted to Instagram!${result.url ? ` URL: ${result.url}` : ''}` : `Failed: ${result.error}`;
        }

        if (block.name === 'post_instagram_story') {
          const input = block.input as { image_url: string };
          const result = await postInstagramStory(input.image_url);
          resultContent = result.success ? 'Posted to Instagram Stories!' : `Failed: ${result.error}`;
        }

        if (block.name === 'post_facebook_story') {
          const input = block.input as { image_url: string };
          const result = await postFacebookStory(input.image_url);
          resultContent = result.success ? 'Posted to Facebook Stories!' : `Failed: ${result.error}`;
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

        if (block.name === 'find_named_image') {
          const input = block.input as { name: string };
          try {
            const matches = await findUploadsByName(input.name);
            resultContent = matches.length === 0
              ? `No named image matching "${input.name}" found.`
              : `Found ${matches.length} match${matches.length === 1 ? '' : 'es'} for "${input.name}":\n` +
                matches.map(m => `- "${m.name}" [${m.folder}] uploaded ${m.created_at} — URL: ${m.url}`).join('\n');
          } catch (err) {
            resultContent = `Failed: ${err instanceof Error ? err.message : String(err)}`;
          }
        }

        if (block.name === 'save_marketing_plan') {
          const input = block.input as {
            week_start: string;
            posts: Array<{ platform: 'linkedin' | 'instagram' | 'facebook'; scheduled_date: string; scheduled_time: string; content: string; image_note?: string; image_urls?: string[] }>;
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
              : `Plan for week of ${weekStart} (${posts.length} posts):\n${formatPlanPosts(posts)}`;
          } catch (err) {
            resultContent = `Failed to get plan: ${err instanceof Error ? err.message : String(err)}`;
          }
        }

        if (block.name === 'get_plan_by_date') {
          const input = block.input as { date: string; date_to?: string };
          try {
            const posts = await getPlanByDateRange(input.date, input.date_to);
            const rangeLabel = input.date_to && input.date_to !== input.date ? `${input.date} to ${input.date_to}` : input.date;
            resultContent = posts.length === 0
              ? `No posts found for ${rangeLabel}.`
              : `Plan for ${rangeLabel} (${posts.length} posts):\n${formatPlanPosts(posts)}`;
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

        if (block.name === 'retry_post') {
          const input = block.input as { post_id: string };
          try {
            const result = await publishPost(input.post_id);
            resultContent = result.success
              ? `Post ${input.post_id} published successfully.${result.url ? ` URL: ${result.url}` : ''}`
              : `Failed: ${result.error}`;
          } catch (err) {
            resultContent = `Failed: ${err instanceof Error ? err.message : String(err)}`;
          }
        }

        if (block.name === 'edit_post') {
          const input = block.input as { post_id: string; content: string };
          try {
            const post = await updatePost(input.post_id, { content: input.content });
            resultContent = `Post ${post.id} updated. New content:\n"${post.content}"`;
          } catch (err) {
            resultContent = `Failed: ${err instanceof Error ? err.message : String(err)}`;
          }
        }

        if (block.name === 'create_video') {
          const input = block.input as {
            script: string;
            platform: 'instagram' | 'facebook';
            caption: string;
            avatar_id?: string;
            voice_id?: string;
          };
          try {
            const created = await createVideo(input.script, input.avatar_id, input.voice_id);
            if (created.error || !created.videoId) {
              resultContent = `Failed: ${created.error}`;
            } else {
              await createVideoJob({
                chatId,
                platform: input.platform,
                caption: input.caption,
                heygenVideoId: created.videoId,
              });
              resultContent = `Video generation started (HeyGen video_id: ${created.videoId}). It'll be uploaded to Cloudinary and posted to ${input.platform} automatically once ready — this can take a few minutes. You'll get a message here when it's done.`;
            }
          } catch (err) {
            resultContent = `Failed: ${err instanceof Error ? err.message : String(err)}`;
          }
        }

        if (block.name === 'list_video_avatars') {
          try {
            const [avatars, voices] = await Promise.all([listAvatars(), listVoices()]);
            const avatarList = avatars.slice(0, 20).map(a => `- ${a.name} (id: ${a.avatarId})`).join('\n') || '(none found)';
            const voiceList = voices.slice(0, 20).map(v => `- ${v.name}${v.language ? ` [${v.language}]` : ''} (id: ${v.voiceId})`).join('\n') || '(none found)';
            resultContent = `Avatars:\n${avatarList}\n\nVoices:\n${voiceList}`;
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

        if (block.name === 'get_top_posts') {
          const input = block.input as { metric?: PerformanceMetric; platform?: 'linkedin' | 'instagram' | 'facebook'; limit?: number };
          try {
            const metric = input.metric ?? 'likes';
            const top = await getTopPerformingPosts({ metric, platform: input.platform, limit: input.limit });
            resultContent = top.length === 0
              ? 'No published posts with engagement data found yet.'
              : `Top ${top.length} posts by ${metric}${input.platform ? ` (${input.platform} only)` : ''}:\n${
                  top.map((p, i) =>
                    `${i + 1}. [${p.platform}] ${p.scheduledDate} ${p.scheduledTime} — "${p.contentPreview}"\n   ID: ${p.postId}\n   Likes: ${p.likes} | Comments: ${p.comments} | Shares: ${p.shares} | Impressions: ${p.impressions} | Reach: ${p.reach} | Engagement rate: ${p.engagementRate.toFixed(2)}%${p.postUrl ? `\n   URL: ${p.postUrl}` : ''}`
                  ).join('\n\n')
                }`;
          } catch (err) {
            resultContent = `Failed: ${err instanceof Error ? err.message : String(err)}`;
          }
        }

        if (block.name === 'search_hashtag') {
          const input = block.input as { hashtag: string };
          try {
            const result = await searchHashtag(input.hashtag);
            if ('error' in result) {
              resultContent = `Failed: ${result.error}`;
            } else {
              const topPostsSummary = result.topPosts
                .map((p, i) => `  ${i + 1}. ${p.likeCount} likes, ${p.commentsCount} comments — ${p.permalink}`)
                .join('\n');
              resultContent = `#${result.tag}: ${result.mediaCount} posts sampled, avg ${result.avgLikes.toFixed(1)} likes, avg ${result.avgComments.toFixed(1)} comments.\nTop posts:\n${topPostsSummary || '  (none found)'}`;
            }
          } catch (err) {
            resultContent = `Failed: ${err instanceof Error ? err.message : String(err)}`;
          }
        }

        if (block.name === 'get_tracked_hashtags') {
          try {
            const tracked = await getTrackedHashtagStats();
            resultContent = tracked.length === 0
              ? 'No hashtags tracked yet.'
              : tracked.map(h => `#${h.tag}: ${h.mediaCount} posts sampled, avg ${h.avgLikes.toFixed(1)} likes, avg ${h.avgComments.toFixed(1)} comments (updated ${h.fetchedAt})`).join('\n');
          } catch (err) {
            resultContent = `Failed: ${err instanceof Error ? err.message : String(err)}`;
          }
        }

        if (block.name === 'add_tracked_hashtag') {
          const input = block.input as { hashtag: string };
          try {
            const result = await addTrackedHashtag(input.hashtag);
            resultContent = 'error' in result
              ? `Failed: ${result.error}`
              : `Added #${result.tag} to the tracked list — it now shows on the /hashtags dashboard (${result.mediaCount} posts sampled, avg ${result.avgLikes.toFixed(1)} likes).`;
          } catch (err) {
            resultContent = `Failed: ${err instanceof Error ? err.message : String(err)}`;
          }
        }
          })(), TOOL_TIMEOUT_MS, block.name);
        } catch (err) {
          resultContent = `Failed: ${err instanceof Error ? err.message : String(err)}`;
          console.error(`[marketing-agent] tool error: ${block.name} after ${Date.now() - toolStartedAt}ms:`, err);
        }
        console.log(`[marketing-agent] tool done: ${block.name} (${Date.now() - toolStartedAt}ms)`);

        toolResults.push({ type: 'tool_result', tool_use_id: block.id, content: resultContent });
      }

      history.push({ role: 'user', content: toolResults });
      await saveMessage(chatId, BOT_NAME, 'user', toolResults);
      continue;
    }

    const textBlock = response.content.find(b => b.type === 'text');
    if (!textBlock || textBlock.type !== 'text') {
      // Seen in production on a heavy generation (e.g. drafting a full weekly
      // plan) that hit max_tokens before emitting any text block — the model
      // was still mid tool-call when the turn got cut off. Not pushing this
      // truncated turn into history: since stop_reason wasn't 'tool_use',
      // any tool_use block here (complete or not) never got a matching
      // tool_result, and saving it would corrupt every later turn in this
      // chat with a dangling tool_use id.
      console.error(`[marketing-agent] turn ended with no text block, stop_reason: ${response.stop_reason}, content types: ${response.content.map(b => b.type).join(', ')}`);
      return response.stop_reason === 'max_tokens'
        ? 'My response got cut off because it was too long — could you try asking for something more specific, or in smaller steps?'
        : 'Something went wrong generating a reply. Please try again.';
    }
    const reply = textBlock.text;
    await saveMessage(chatId, BOT_NAME, 'assistant', reply);
    return reply;
  }
}
