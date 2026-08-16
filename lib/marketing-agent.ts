import Anthropic from '@anthropic-ai/sdk';
import { postToLinkedIn } from '@/lib/linkedin-poster';
import { postToFacebook, postToInstagram, postInstagramStory, postFacebookStory } from '@/lib/meta-poster';
import { loadHistory, saveMessage, clearHistory as clearDb, drainBroadcasts } from '@/lib/chat-history';
import { acquireChatLock, releaseChatLock } from '@/lib/chat-lock';
import { listCloudinaryImages, listCloudinaryImagesInFolder } from '@/lib/cloudinary';
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
  recordDirectPostInPlan,
  getPostedPostsForCommentCheck,
  type PostUpdate,
  type MarketingPost,
} from '@/lib/marketing-plan';
import { searchHashtag, getTrackedHashtagStats, addTrackedHashtag } from '@/lib/instagram-hashtags';
import { publishPost } from '@/lib/publish-post';
import { createVideo, listAvatars, listMyAvatars, listVoices, type HeyGenAvatar } from '@/lib/heygen';
import { createVideoJob } from '@/lib/video-jobs';
import { getLandingCopyOrThrow, updateLandingCopy, type EditableLandingCopy } from '@/lib/landing-copy';
import type { Locale } from '@/app/invest/[locale]/copy';
import { screenshotUrl, screenshotUrlWithLinks } from '@/lib/browser';
import { createConsultation } from '@/lib/bot-consultations';
import {
  listTopics as listInteractionTopics,
  addTopic as addInteractionTopicRow,
  removeTopic as removeInteractionTopicRow,
  getDailyCounts as getInteractionDailyCounts,
  setDailyCount as setInteractionDailyCount,
  addPost as addInteractionPostRow,
  looksLikePostUrl,
  type InteractionPlatform,
} from '@/lib/interactions';
import { recordUsage } from '@/lib/token-usage';
import { isCronEnabled } from '@/lib/cron-settings';

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
//
// Sized for browse_url, same as Angeles's (lib/product-agent.ts) — it
// launches a real remote Browserbase session that can take up to 30s for
// navigation alone, plus cold-start overhead, well past what the fast API
// calls below actually need. Still comfortably under this route's 300s
// maxDuration.
const TOOL_TIMEOUT_MS = 90_000;

// Confirmed in production on Angeles's identical browse_url: given no cap,
// she went on an unbounded competitive-research spree in one turn -- 20
// sequential screenshots, each harmless alone but summing to blow straight
// through the route's maxDuration with nothing delivered. A cap on total
// browse_url calls per turn guarantees the loop always leaves enough budget
// for a final text reply.
const MAX_BROWSE_CALLS_PER_TURN = 6;

function withTimeout<T>(promise: Promise<T>, ms: number, label: string): Promise<T> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(`Tool "${label}" timed out after ${ms}ms`)), ms);
    promise.then(
      value => { clearTimeout(timer); resolve(value); },
      err => { clearTimeout(timer); reject(err); }
    );
  });
}

// String.substring() cuts by UTF-16 code unit, which can land inside a
// surrogate pair (any emoji, routine in these Spanish social posts) and
// leave a dangling lone surrogate — invalid JSON once this round-trips
// through a tool_result into a later Anthropic API request. Confirmed in
// production on an identical truncation in lib/engagement.ts: "The request
// body is not valid JSON: no low surrogate in string", which broke the
// whole conversation with no way to recover mid-turn. Array.from() splits
// by Unicode code point instead, so a surrogate pair always stays intact.
function truncateSafely(text: string, maxLen: number): string {
  if (text.length <= maxLen) return text;
  return `${Array.from(text).slice(0, maxLen).join('')}...`;
}

// Shared by get_weekly_plan and get_plan_by_date — both list plan posts the
// same way, just scoped differently (a Monday-aligned week vs. an arbitrary
// date/range).
function formatPlanPosts(posts: MarketingPost[]): string {
  return posts.map((p, i) => {
    if (p.post_type === 'video') {
      return `${i + 1}. [${p.platform}] [video] ${p.scheduled_date} ${p.scheduled_time} [${p.status}]\n   ID: ${p.id}\n   Avatar: ${p.avatar_id ?? '(default)'}\n   Script: ${p.video_script}\n   Caption: ${p.content}`;
    }
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
  const appUrl = process.env.NEXT_PUBLIC_APP_URL || 'https://marketing-brown-two.vercel.app';

  return `You are Pepe, a highly experienced marketing expert with 25+ years in real estate development focused on the hotel and hospitality ecosystem. Your background spans luxury resorts, boutique hotels, eco-lodges, mixed-use developments, and hospitality-anchored real estate projects across Latin America and Europe.

---

## YOUR TEAMMATES
You share this Telegram group with two other bots — you're the only one of the three focused on marketing, so stay in your lane and point people to the right one instead of trying to cover their ground yourself:
- **Santi** — CTO. Reads and writes the actual code for this app, opens and merges pull requests. If someone needs a bug fixed or a feature built, that's him, not you.
- **Angeles** — CPO. Advises on product strategy, UX, and roadmap (PRDs, user flows, prioritization) — no code access. If a request is really about product/UX direction rather than marketing content, that's her.

You only ever see a message here if it was addressed to you (or wasn't addressed to anyone in particular), or if a teammate posted something and it's shown to you as passive context, prefixed **"[Santi posted in the group]"** or **"[Angeles posted in the group]"** — that's just situational awareness, not a request; don't reply to it. Mentioning Santi or Angeles by name in your own reply doesn't ping them either; the user has to address them directly for that, except for \`consult_santi\`/\`consult_angeles\` below, which loop them in on your own initiative, and the one existing exception: a message starting with **"[Consultation from Angeles — CPO]"** means she just finished a product/design recommendation elsewhere in this chat and looped you in automatically for your take, via her own initiative rather than the user's — this is real, not spam. Give a focused marketing-manager perspective on it — messaging, positioning, target-audience fit, conversion/growth impact — don't redirect it back to her (you're being asked precisely because it has a marketing angle) and don't just restate her recommendation. Keep it tight: a few sentences unless the topic genuinely needs more, and you don't need get_landing_page_copy or other tools unless the brief specifically requires checking current live copy.

\`consult_santi\` and \`consult_angeles\` ask a teammate for their read on something you're drafting or considering — a technical-feasibility check from Santi (e.g. before promising a feature in copy), or a product/UX read from Angeles (e.g. whether a flow you're describing actually makes sense). Only call one when a task genuinely needs that input, not for every passing mention of them. Both just record a brief and return immediately; the teammate replies separately and posts their own take directly into this chat once ready (usually a few minutes) — don't wait for it before finishing your own turn. Their reply arrives later as a fresh incoming message prefixed **"[Reply from Santi — CTO, re: your consultation]"** or **"[Reply from Angeles — CPO, re: your consultation]"** (or **"[System]"** if it failed) — treat that as their real answer and fold it in; don't loop more than a couple of rounds if it's not converging.

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

If the user tells you which folder to grab images from (e.g. "use images from the Peral 23 folder"), pass that name as the folder argument to browse_drive_images instead of calling it with no arguments — that lists just that gallery subfolder rather than the default pool. If none of its images fit the post, say so rather than falling back to the default pool without asking.

If the user instead refers to an image by a custom name they gave it earlier (e.g. "use the sunset image I uploaded") rather than picking from what browse_drive_images shows, call find_named_image instead — that's how images uploaded through your Telegram "upload" flow are found, since browse_drive_images only surfaces Cloudinary filenames, not the names users gave them.

---

## LANDING PAGE LINK — EVERY POST, ALL PLATFORMS

**Every LinkedIn, Instagram, and Facebook post must include a call-to-action link to the investor landing page, using this exact tracked format:**

\`${appUrl}/go/es?utm_source=<platform>&utm_medium=social&utm_campaign=bds36\`

- Always \`/go/es\` (Spanish locale, matching the mandatory Spanish copy) — never link straight to \`/invest/es\` or to www.grupoyakgu.es, since only \`/go/\` logs the click before redirecting, and skipping it loses attribution entirely.
- \`utm_source\` is the platform the post is going out on: \`linkedin\`, \`instagram\`, or \`facebook\` — never reuse one platform's link on another.
- \`utm_medium\` is always \`social\`.
- \`utm_campaign\` is always \`bds36\` (the current campaign) unless the user explicitly tells you to use a different one.

Example for a LinkedIn post: \`${appUrl}/go/es?utm_source=linkedin&utm_medium=social&utm_campaign=bds36\`

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

## VIDEO POSTS IN THE WEEKLY PLAN
A post in save_marketing_plan can be a HeyGen avatar video instead of a text/image post — set post_type to "video" on that post instead of calling create_video directly. Only do this when the user explicitly asks for a video post in the plan, exactly like create_video itself — never add one proactively as part of routine planning. Requirements specific to a video post:
- platform must be instagram or facebook — HeyGen video posting doesn't support LinkedIn, so never schedule a video post there.
- video_script is required and is what the avatar actually says — content is still the platform caption, a separate piece of text, not the script.
- avatar_id is optional per post — use list_video_avatars if the user wants a specific look for that post; otherwise it uses the account's default avatar. The voice is always the account default (there's no per-post voice override).
- Skip image_urls/image_note entirely for a video post — there's no image to pick.

A scheduled video post goes through the exact same draft → approve → posted flow as any other post. The only difference is timing: at its scheduled time, the post-schedule cron starts HeyGen generation and moves the post to a 'generating' status rather than posting immediately (generation takes minutes) — you'll see that status in get_weekly_plan/get_plan_by_date while it renders, then 'posted' once it's actually live, same as create_video's own background flow. If a video post ends up 'failed' (HeyGen generation, upload, or the actual platform post itself failed), retry_post re-triggers a fresh HeyGen generation for it, same as for any other failed post.

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
- save_marketing_plan, get_weekly_plan, get_plan_by_date, approve_posts, reject_post, reschedule_post, retry_post, edit_post — plan management. get_plan_by_date looks up a specific date or range instead of a Monday-aligned week. save_marketing_plan can also schedule a HeyGen video post (post_type "video") — see VIDEO POSTS IN THE WEEKLY PLAN.
- compare_posts — compare engagement between two named posts
- get_top_posts — rank all published posts by likes/comments/shares/impressions/reach/engagement_rate
- reply_to_comment — reply to a specific comment
- post_comment — post a new top-level comment on a post (for thank-yous)
- get_engagement — fetch likes/comments/reach stats
- search_hashtag — look up an Instagram hashtag's engagement stats (avg likes/comments, top posts) for content research. Read-only: there is no way to comment on or otherwise interact with posts this surfaces — never suggest that as an option. Each call is a real network round-trip — check at most 3-4 hashtags per message; if asked to check more, do a batch of a few, report back, and continue with the rest in a follow-up message rather than calling it a dozen+ times in one turn (risks a timeout that can corrupt the conversation).
- create_video, list_video_avatars — generate an AI avatar video (HeyGen) and auto-post it once ready; only when explicitly asked, never proactively as part of routine planning
- get_tracked_hashtags — see the user's tracked hashtag list with cached stats (same as the /hashtags dashboard)
- add_tracked_hashtag — add a hashtag you've found worth tracking to that list, so the user sees it in the dashboard too
- get_landing_page_copy, update_landing_page_copy — read and edit the content of the investor landing page (/invest/es, /invest/en, /invest/he — headline, highlights, market intel bullets, form section text, etc.). Edits are live immediately, no deploy needed. Always call get_landing_page_copy first so you're editing from the actual current wording, not guessing. Ask which language(s) to apply a change to if it's not obvious from context — an edit only applies to the locale you pass, it doesn't propagate to the others automatically, since each language's copy is an independent, deliberately localized translation rather than a mechanical mirror of the others.
- browse_url — take a screenshot of any public webpage (a competitor, a reference site, an article the user points you at) so you can judge it from what it actually looks like instead of guessing from memory. Each call launches a real remote browser session that can take up to 30s; you have a budget of a few per conversation turn — pick the handful most worth looking at rather than surveying everything, and if you run out mid-research, answer with what you've already seen and offer to look at more in a follow-up.
- consult_santi, consult_angeles — loop a teammate in for their technical or product/UX take on your own initiative, when a task genuinely needs it

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
    description: 'Lists available images from Cloudinary. Call ONCE per plan. By default lists the general image pool; pass folder to instead list a specific named subfolder of the gallery (e.g. a project name the user tells you to pull from).',
    input_schema: {
      type: 'object' as const,
      properties: {
        folder: { type: 'string', description: 'Name of a specific gallery subfolder to list instead of the default pool, e.g. "Peral 23". Matched case-insensitively.' },
      },
      required: [],
    },
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
              platform: { type: 'string', enum: ['linkedin', 'instagram', 'facebook'], description: 'A video post (post_type "video") only supports instagram or facebook, never linkedin.' },
              scheduled_date: { type: 'string' },
              scheduled_time: { type: 'string' },
              content: { type: 'string', description: 'The platform caption. For a video post this is still the caption, not what the avatar says (see video_script).' },
              image_note: { type: 'string', description: 'Human-readable label for the image, e.g. "Nervión skyline at dusk". Not used for a video post.' },
              image_urls: {
                type: 'array',
                items: { type: 'string' },
                description: 'Exact URL(s) of the chosen image(s) from browse_drive_images. One image is the default; only include multiple if the user specifically asked for a carousel/multi-image post. Not used for a video post.',
              },
              post_type: { type: 'string', enum: ['standard', 'video'], description: 'Omit or "standard" for a normal text/image post. Set "video" to schedule a HeyGen avatar video instead — requires video_script, and platform must be instagram or facebook.' },
              video_script: { type: 'string', description: 'Required when post_type is "video" — what the avatar says. This is separate from content, which stays the caption.' },
              avatar_id: { type: 'string', description: 'Optional HeyGen avatar override for this video post — use list_video_avatars to pick one. Falls back to the account default when omitted. Ignored for a standard post.' },
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
      'Publishes an existing marketing plan post right now, using whatever content, image, and platform are already saved on it — use this when a previously-approved post failed to publish and the user wants it retried, or when an already-approved post should go out immediately instead of waiting for its scheduled time. Only works on posts with status approved or failed. Refuses a post that is still a draft (approve it first with approve_posts) and refuses one that has already been posted.',
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
      'Generates an AI avatar video from a text script via HeyGen right now, then automatically uploads it to Cloudinary and posts it to Instagram or Facebook once ready. Generation and posting run in the background and can take several minutes — this call only starts the process and returns immediately; the user gets a Telegram message here when it actually finishes (posted or failed), so tell them it is running rather than that it is done. Uses a fixed default avatar/voice unless avatar_id/voice_id are given — use list_video_avatars first if the user wants to pick a specific one. For a video the user wants scheduled into the weekly plan instead of posted immediately, use save_marketing_plan with post_type "video" instead of this tool.',
    input_schema: {
      type: 'object' as const,
      properties: {
        script: { type: 'string', description: 'What the avatar should say in the video.' },
        platform: { type: 'string', enum: ['instagram', 'facebook'] },
        caption: { type: 'string', description: 'Caption for the resulting post.' },
        avatar_id: { type: 'string', description: 'Optional — overrides the default HeyGen avatar.' },
        voice_id: { type: 'string', description: 'Optional — overrides the default HeyGen voice.' },
        motion_prompt: { type: 'string', description: 'Optional — controls the avatar\'s motion and gestures, e.g. "excited and energetic", "professional and calm".' },
      },
      required: ['script', 'platform', 'caption'],
    },
  },
  {
    name: 'list_video_avatars',
    description: 'Lists available HeyGen avatars and voices — use when the user wants to pick one for create_video or a scheduled video post instead of using the default. Returns two avatar sections: "My Avatars" (custom looks created on this HeyGen account) and "Public Avatars" (HeyGen\'s stock library) — either kind\'s id works as avatar_id.',
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
  {
    name: 'get_landing_page_copy',
    description: 'Reads the current live content of the investor landing page (/invest/<locale>) for a given language — headline, highlights, market intel bullets, etc. Use this before update_landing_page_copy so you know the exact current wording rather than guessing at it.',
    input_schema: {
      type: 'object' as const,
      properties: {
        locale: { type: 'string', enum: ['es', 'en', 'he'], description: 'Which language version to read.' },
      },
      required: ['locale'],
    },
  },
  {
    name: 'update_landing_page_copy',
    description: 'Edits the content of the investor landing page (/invest/<locale>) for one language — changes are live immediately, no deploy needed. Only pass the fields being changed; everything else on the page stays as it is. Call get_landing_page_copy first so you\'re editing from the actual current wording. highlights and marketPoints, if provided, fully replace the existing list rather than merging item by item — pass the complete new list, not just the item(s) changing.',
    input_schema: {
      type: 'object' as const,
      properties: {
        locale: { type: 'string', enum: ['es', 'en', 'he'] },
        metaTitle: { type: 'string', description: 'Browser tab title / SEO title.' },
        metaDescription: { type: 'string', description: 'SEO meta description.' },
        eyebrow: { type: 'string', description: 'Small label above the headline, e.g. "Grupo YAKGU presents".' },
        headline: { type: 'string' },
        subheadline: { type: 'string' },
        ctaPrimary: { type: 'string', description: 'Text on the main call-to-action button.' },
        highlightsTitle: { type: 'string', description: 'Heading above the "opportunity" cards.' },
        highlights: {
          type: 'array',
          description: 'The opportunity highlight cards. Replaces the full list.',
          items: {
            type: 'object',
            properties: {
              title: { type: 'string' },
              body: { type: 'string' },
            },
            required: ['title', 'body'],
          },
        },
        marketTitle: { type: 'string', description: 'Heading above the market intelligence section.' },
        marketIntro: { type: 'string' },
        marketPoints: {
          type: 'array',
          description: 'Market proof-point bullets. Replaces the full list.',
          items: { type: 'string' },
        },
        galleryTitle: { type: 'string' },
        formTitle: { type: 'string' },
        formSubtitle: { type: 'string' },
        footerLine: { type: 'string' },
      },
      required: ['locale'],
    },
  },
  {
    name: 'browse_url',
    description: 'Takes a screenshot of any public webpage — a competitor site, a landing page the user asks about, a design reference, an article. Use this whenever the user asks about a specific URL, instead of guessing at what it looks like or declining because you think you can\'t see it.',
    input_schema: {
      type: 'object' as const,
      properties: {
        url: { type: 'string', description: 'Full URL to browse, including the scheme, e.g. "https://example.com/page".' },
        full_page: { type: 'boolean', description: 'Capture the full scrollable page instead of just the visible viewport. Defaults to false.' },
      },
      required: ['url'],
    },
  },
  {
    name: 'browse_social_search',
    description: 'Like browse_url, but for finding commentable posts (the Interactions feature): browses a search/hashtag/topic results page on LinkedIn, Instagram, or Facebook using a logged-in session (these platforms show a login wall to anonymous visitors), and returns both a screenshot and the actual post permalink links found on the page — a screenshot alone never exposes a post\'s real link, only its visible caption/author. Use this instead of browse_url specifically when fulfilling an Interactions discovery request.',
    input_schema: {
      type: 'object' as const,
      properties: {
        url: { type: 'string', description: 'Full URL of a search/hashtag/topic results page on linkedin.com, instagram.com, or facebook.com.' },
        platform: { type: 'string', enum: ['linkedin', 'facebook', 'instagram'], description: 'Which platform this page is on — used to filter the extracted links down to ones that actually look like post permalinks.' },
      },
      required: ['url', 'platform'],
    },
  },
  {
    name: 'add_interaction_post',
    description: 'Adds a discovered post to the Interactions list (the dashboard page tracking outside posts worth commenting on). Only call this with a real post permalink you found via browse_social_search\'s extracted links — never a profile URL, a hashtag page URL, or a guessed/constructed link.',
    input_schema: {
      type: 'object' as const,
      properties: {
        platform: { type: 'string', enum: ['linkedin', 'facebook', 'instagram'] },
        url: { type: 'string', description: 'The post\'s actual permalink, as found in browse_social_search\'s extracted links list.' },
        topic: { type: 'string', description: 'Which of the configured interaction topics this post relates to.' },
        author: { type: 'string', description: 'The post author\'s visible name, if shown.' },
        content_preview: { type: 'string', description: 'A short excerpt of the post\'s visible text/caption.' },
        likes: { type: 'number', description: 'Visible like count, if shown on the page.' },
        comments: { type: 'number', description: 'Visible comment count, if shown on the page.' },
        shares: { type: 'number', description: 'Visible share/repost count, if shown on the page.' },
      },
      required: ['platform', 'url', 'topic'],
    },
  },
  {
    name: 'get_interaction_settings',
    description: 'Gets the current Interactions feature configuration: the daily per-platform post target, and the list of topics (and who added each — you or the user) that posts are discovered for.',
    input_schema: { type: 'object' as const, properties: {}, required: [] },
  },
  {
    name: 'set_interaction_daily_count',
    description: 'Changes how many posts the Interactions page keeps active at once for one platform. Each platform has its own target — this only changes the one specified.',
    input_schema: {
      type: 'object' as const,
      properties: {
        platform: { type: 'string', enum: ['linkedin', 'facebook', 'instagram'] },
        count: { type: 'number', description: 'New daily target for that platform, e.g. 3.' },
      },
      required: ['platform', 'count'],
    },
  },
  {
    name: 'add_interaction_topic',
    description: 'Adds a topic to look for commentable posts about, for the Interactions feature.',
    input_schema: {
      type: 'object' as const,
      properties: {
        topic: { type: 'string', description: 'The topic to add, e.g. "Sevilla real estate market" or "AT license regulations".' },
      },
      required: ['topic'],
    },
  },
  {
    name: 'remove_interaction_topic',
    description: 'Removes a topic from the Interactions feature\'s list — use get_interaction_settings first to find its exact id.',
    input_schema: {
      type: 'object' as const,
      properties: {
        id: { type: 'string', description: 'The topic\'s id, from get_interaction_settings.' },
      },
      required: ['id'],
    },
  },
  {
    name: 'consult_santi',
    description: 'Asks Santi (the CTO) for a technical-feasibility opinion on something you\'re drafting or considering — e.g. before promising a feature or capability in copy. This only records the brief and returns immediately; Santi replies separately and posts his take directly into this chat as himself once ready (usually a few minutes) — don\'t wait for or expect his reply in this same turn. Only call this when a task genuinely needs his input, not for every passing mention of him.',
    input_schema: {
      type: 'object' as const,
      properties: {
        brief: { type: 'string', description: 'A clear, self-contained question or context for Santi — he does not see this conversation, only this text.' },
      },
      required: ['brief'],
    },
  },
  {
    name: 'consult_angeles',
    description: 'Asks Angeles (the CPO) for a product/UX opinion on something you\'re drafting or considering — e.g. whether a flow or feature you\'re describing in copy actually makes sense. This only records the brief and returns immediately; Angeles replies separately and posts her take directly into this chat as herself once ready (usually a few minutes) — don\'t wait for or expect her reply in this same turn. Only call this when a task genuinely needs her input, not for every passing mention of her.',
    input_schema: {
      type: 'object' as const,
      properties: {
        brief: { type: 'string', description: 'A clear, self-contained question or context for Angeles — she does not see this conversation, only this text.' },
      },
      required: ['brief'],
    },
  },
];

export async function clearHistory(chatId: number): Promise<void> {
  await clearDb(chatId, BOT_NAME);
}

export async function chat(chatId: number, userMessage: string): Promise<string> {
  await acquireChatLock(chatId, BOT_NAME);
  try {
    return await chatInner(chatId, userMessage);
  } finally {
    await releaseChatLock(chatId, BOT_NAME);
  }
}

async function chatInner(chatId: number, userMessage: string): Promise<string> {
  await drainBroadcasts(chatId, BOT_NAME);
  const history = await loadHistory(chatId, BOT_NAME);
  history.push({ role: 'user', content: userMessage });
  await saveMessage(chatId, BOT_NAME, 'user', userMessage);

  // Persists across every internal turn of this single chat() call (one
  // Telegram message), reset fresh on the next one -- see
  // MAX_BROWSE_CALLS_PER_TURN above.
  let browseCallCount = 0;

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
          model: 'claude-sonnet-5',
          max_tokens: 8192,
          system: buildSystemPrompt(),
          tools,
          messages: history,
          // Auto-caches the last cacheable block of the rendered prompt --
          // system prompt, tools, and all prior turns of `history` -- so
          // each new turn only pays full price for what it appended since
          // the last call, instead of reprocessing the whole growing
          // conversation from scratch every message.
          cache_control: { type: 'ephemeral' },
        },
        { timeout: 200_000, maxRetries: 1 }
      ),
      220_000,
      'anthropic messages.create'
    );
    console.log(`[marketing-agent] anthropic turn (${Date.now() - turnStartedAt}ms), stop_reason: ${response.stop_reason}`);
    await recordUsage('pepe', response.model, response.usage, chatId);

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
        let resultContent: Anthropic.ToolResultBlockParam['content'] = '';

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
            if (result.success && result.postId) {
              await trackDirectPost('linkedin', result.postId);
              await recordDirectPostInPlan({
                platform: 'linkedin',
                content: input.content,
                postUrl: result.url,
                platformPostId: result.postId,
                postType: 'standard',
              });
            }
            resultContent = result.success
              ? `Posted to LinkedIn${input.via_community_management ? ' via the Community Management app' : ''}!${result.url ? ` URL: ${result.url}` : ''}`
              : `Failed: ${result.error}`;
          }
        }

        if (block.name === 'post_to_facebook') {
          const input = block.input as { message: string; image_urls?: string[] };
          const result = await postToFacebook(input.message, input.image_urls);
          if (result.success && result.postId) {
            await trackDirectPost('facebook', result.postId);
            await recordDirectPostInPlan({
              platform: 'facebook',
              content: input.message,
              postUrl: result.url,
              platformPostId: result.postId,
              postType: 'standard',
            });
          }
          resultContent = result.success ? `Posted to Facebook!${result.url ? ` URL: ${result.url}` : ''}` : `Failed: ${result.error}`;
        }

        if (block.name === 'post_to_instagram') {
          const input = block.input as { caption: string; image_urls: string[] };
          const result = await postToInstagram(input.caption, input.image_urls);
          if (result.success && result.postId) {
            await trackDirectPost('instagram', result.postId);
            await recordDirectPostInPlan({
              platform: 'instagram',
              content: input.caption,
              postUrl: result.url,
              platformPostId: result.postId,
              postType: 'standard',
            });
          }
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
          const input = block.input as { folder?: string };
          try {
            const images = input.folder
              ? await listCloudinaryImagesInFolder(input.folder)
              : await listCloudinaryImages();
            resultContent = images.length === 0
              ? (input.folder ? `No images found in folder "${input.folder}".` : 'No images found in Cloudinary.')
              : `Found ${images.length} images${input.folder ? ` in "${input.folder}"` : ''}:\n` + images.map(img => `- ${img.name} | URL: ${img.url}`).join('\n');
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
            posts: Array<{
              platform: 'linkedin' | 'instagram' | 'facebook';
              scheduled_date: string;
              scheduled_time: string;
              content: string;
              image_note?: string;
              image_urls?: string[];
              post_type?: 'standard' | 'video';
              video_script?: string;
              avatar_id?: string;
            }>;
          };
          try {
            for (const [i, p] of input.posts.entries()) {
              if (p.post_type === 'video') {
                if (p.platform === 'linkedin') {
                  throw new Error(`Post ${i + 1}: video posts only support instagram or facebook, not linkedin.`);
                }
                if (!p.video_script) {
                  throw new Error(`Post ${i + 1}: post_type "video" requires video_script.`);
                }
              }
            }
            const saved = await saveDraftPlan(input.posts.map(p => ({ ...p, week_start: input.week_start })));
            resultContent = `Saved ${saved.length} posts as drafts for week of ${input.week_start}.\nPost IDs:\n${
              saved.map((p, i) => `${i + 1}. [${p.platform}]${p.post_type === 'video' ? ' [video]' : ''} ${p.scheduled_date} ${p.scheduled_time} — ID: ${p.id}`).join('\n')
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
            resultContent = result.pending
              ? `Video generation started for post ${input.post_id} — it'll post automatically once ready, and you'll get a message here when it does.`
              : result.success
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
            motion_prompt?: string;
          };
          try {
            const motionPrompt = input.motion_prompt || 'Natural, relaxed, and animated — move hands, arms, and upper body fluidly and naturally while speaking, as if explaining something to a colleague in person, with all visible body parts in motion rather than staying static.';
            const created = await createVideo(input.script, input.avatar_id, input.voice_id, motionPrompt);
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
            const [myAvatars, publicAvatars, voices] = await Promise.all([listMyAvatars(), listAvatars(), listVoices()]);
            const formatAvatars = (list: HeyGenAvatar[]) =>
              list.slice(0, 20).map(a => `- ${a.name} (id: ${a.avatarId})`).join('\n') || '(none found)';
            const voiceList = voices.slice(0, 20).map(v => `- ${v.name}${v.language ? ` [${v.language}]` : ''} (id: ${v.voiceId})`).join('\n') || '(none found)';
            resultContent = `My Avatars:\n${formatAvatars(myAvatars)}\n\nPublic Avatars:\n${formatAvatars(publicAvatars)}\n\nVoices:\n${voiceList}`;
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
                const label = `[${post.platform}] ${post.scheduled_date} ${post.scheduled_time} — "${truncateSafely(post.content, 60)}"`;
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

        if (block.name === 'get_landing_page_copy') {
          const input = block.input as { locale: Locale };
          try {
            const copy = await getLandingCopyOrThrow(input.locale);
            resultContent = `Current content for /invest/${input.locale}:\n\n` +
              `metaTitle: ${copy.metaTitle}\n` +
              `metaDescription: ${copy.metaDescription}\n` +
              `eyebrow: ${copy.eyebrow}\n` +
              `headline: ${copy.headline}\n` +
              `subheadline: ${copy.subheadline}\n` +
              `ctaPrimary: ${copy.ctaPrimary}\n` +
              `highlightsTitle: ${copy.highlightsTitle}\n` +
              `highlights:\n${copy.highlights.map((h, i) => `  ${i + 1}. ${h.title} — ${h.body}`).join('\n')}\n` +
              `marketTitle: ${copy.marketTitle}\n` +
              `marketIntro: ${copy.marketIntro}\n` +
              `marketPoints:\n${copy.marketPoints.map((p, i) => `  ${i + 1}. ${p}`).join('\n')}\n` +
              `galleryTitle: ${copy.galleryTitle}\n` +
              `formTitle: ${copy.formTitle}\n` +
              `formSubtitle: ${copy.formSubtitle}\n` +
              `footerLine: ${copy.footerLine}`;
          } catch (err) {
            resultContent = `Failed: ${err instanceof Error ? err.message : String(err)}`;
          }
        }

        if (block.name === 'update_landing_page_copy') {
          const input = block.input as { locale: Locale } & EditableLandingCopy;
          try {
            const { locale, ...fields } = input;
            const changedKeys = Object.keys(fields);
            if (changedKeys.length === 0) {
              resultContent = 'No fields provided — nothing changed.';
            } else {
              const updated = await updateLandingCopy(locale, fields);
              resultContent = `Updated /invest/${locale}: ${changedKeys.join(', ')}. Live immediately, no deploy needed.\n\nCurrent headline: ${updated.headline}`;
            }
          } catch (err) {
            resultContent = `Failed: ${err instanceof Error ? err.message : String(err)}`;
          }
        }

        if (block.name === 'browse_url') {
          browseCallCount++;
          if (browseCallCount > MAX_BROWSE_CALLS_PER_TURN) {
            resultContent = `Browsing budget for this conversation turn is used up (max ${MAX_BROWSE_CALLS_PER_TURN} screenshots) — answer with what you've already seen instead of browsing more; the user can ask you to look at specific other pages in a follow-up message.`;
          } else {
            const input = block.input as { url: string; full_page?: boolean };
            try {
              const screenshot = await screenshotUrl(input.url, input.full_page ?? false);
              resultContent = [
                { type: 'text', text: `Screenshot of ${input.url}:` },
                { type: 'image', source: { type: 'base64', media_type: 'image/png', data: screenshot.toString('base64') } },
              ];
            } catch (err) {
              resultContent = `Failed: ${err instanceof Error ? err.message : String(err)}`;
            }
          }
        }

        if (block.name === 'browse_social_search') {
          browseCallCount++;
          // Shares its on/off switch with the "Process Interaction Fetches" cron
          // (Settings → Crons) -- flipped off 2026-08-13 while LinkedIn/Facebook's
          // automated login is being blocked, so a direct Telegram ask for a post
          // doesn't burn more login attempts against a wall known to be up. One
          // switch controls both the scheduled queue drain and any live request.
          if (!(await isCronEnabled('process-interaction-fetches'))) {
            resultContent = 'Interactions discovery (browse_social_search) is temporarily disabled — LinkedIn/Facebook are blocking the automated login used to browse them, and this is paused until that\'s resolved. Don\'t retry; tell the user it\'s paused rather than reporting a login-wall failure.';
          } else if (browseCallCount > MAX_BROWSE_CALLS_PER_TURN) {
            resultContent = `Browsing budget for this conversation turn is used up (max ${MAX_BROWSE_CALLS_PER_TURN} screenshots) — answer with what you've already seen instead of browsing more; the user can ask you to look at specific other pages in a follow-up message.`;
          } else {
            const input = block.input as { url: string; platform: InteractionPlatform };
            try {
              const { screenshot, links } = await screenshotUrlWithLinks(input.url, false, input.platform);
              const candidates = Array.from(new Set(
                links.filter(l => looksLikePostUrl(input.platform, l.href)).map(l => l.href)
              ));
              const linksText = candidates.length > 0
                ? `Candidate post links found on the page (pick one that matches something relevant in the screenshot, then call add_interaction_post):\n${candidates.slice(0, 25).map(h => `- ${h}`).join('\n')}`
                : 'No post-permalink-shaped links were found on this page — it may require being logged in, may have blocked/limited the request, or the URL may need adjusting. Do not guess or construct a link yourself.';
              resultContent = [
                { type: 'text', text: `Screenshot of ${input.url}:` },
                { type: 'image', source: { type: 'base64', media_type: 'image/png', data: screenshot.toString('base64') } },
                { type: 'text', text: linksText },
              ];
            } catch (err) {
              resultContent = `Failed: ${err instanceof Error ? err.message : String(err)}`;
            }
          }
        }

        if (block.name === 'add_interaction_post') {
          const input = block.input as {
            platform: InteractionPlatform;
            url: string;
            topic: string;
            author?: string;
            content_preview?: string;
            likes?: number;
            comments?: number;
            shares?: number;
          };
          try {
            const post = await addInteractionPostRow(input);
            resultContent = `Added ${input.platform} post to Interactions: ${post.url}`;
          } catch (err) {
            resultContent = `Failed: ${err instanceof Error ? err.message : String(err)}`;
          }
        }

        if (block.name === 'get_interaction_settings') {
          try {
            const [dailyCounts, topics] = await Promise.all([getInteractionDailyCounts(), listInteractionTopics()]);
            const countsText = `Daily targets — linkedin: ${dailyCounts.linkedin}, facebook: ${dailyCounts.facebook}, instagram: ${dailyCounts.instagram}.`;
            resultContent = topics.length > 0
              ? `${countsText}\n\nTopics:\n${topics.map(t => `- ${t.topic} (added by ${t.added_by}, id: ${t.id})`).join('\n')}`
              : `${countsText}\n\nNo topics configured yet.`;
          } catch (err) {
            resultContent = `Failed: ${err instanceof Error ? err.message : String(err)}`;
          }
        }

        if (block.name === 'set_interaction_daily_count') {
          const input = block.input as { platform: InteractionPlatform; count: number };
          try {
            const count = await setInteractionDailyCount(input.platform, input.count);
            resultContent = `Daily target for ${input.platform} is now ${count} posts.`;
          } catch (err) {
            resultContent = `Failed: ${err instanceof Error ? err.message : String(err)}`;
          }
        }

        if (block.name === 'add_interaction_topic') {
          const input = block.input as { topic: string };
          try {
            const topic = await addInteractionTopicRow(input.topic, 'pepe');
            resultContent = `Added topic "${topic.topic}" (id: ${topic.id}).`;
          } catch (err) {
            resultContent = `Failed: ${err instanceof Error ? err.message : String(err)}`;
          }
        }

        if (block.name === 'remove_interaction_topic') {
          const input = block.input as { id: string };
          try {
            await removeInteractionTopicRow(input.id);
            resultContent = 'Topic removed.';
          } catch (err) {
            resultContent = `Failed: ${err instanceof Error ? err.message : String(err)}`;
          }
        }

        if (block.name === 'consult_santi') {
          const input = block.input as { brief: string };
          // Not run inline — same reasoning as every other consult/delegate
          // hop in this codebase (see lib/bot-consultations.ts): Santi's own
          // turn gets his full, undiminished budget via the
          // process-bot-consultations cron instead of sharing this route's
          // 300s maxDuration.
          await createConsultation(chatId, 'pepe', 'santi', input.brief);
          resultContent = 'Consulted Santi. He\'ll post his technical take directly in this chat once it\'s ready — usually within a few minutes.';
        }

        if (block.name === 'consult_angeles') {
          const input = block.input as { brief: string };
          await createConsultation(chatId, 'pepe', 'angeles', input.brief);
          resultContent = 'Consulted Angeles. She\'ll post her product take directly in this chat once it\'s ready — usually within a few minutes.';
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
