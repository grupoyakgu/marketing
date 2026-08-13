# Marketing Agent

## Stack
- Next.js 14 (App Router)
- Vercel serverless functions
- Telegram Bot API (webhook mode)
- Anthropic SDK (claude-sonnet-5 for Pepe/Santi/Angeles/Abu, claude-haiku-4-5 for lead extraction)
- Supabase (job queue)
- LinkedIn UGC Posts API

## Project Structure
- /app/api/telegram/route.ts        → Pepe's webhook handler (maxDuration: 300s)
- /app/api/telegram-santi/route.ts  → Santi's webhook handler (maxDuration: 300s)
- /app/api/telegram-angeles/route.ts → Angeles's webhook handler (maxDuration: 300s)
- /app/api/linkedin/process/route.ts → background video processor (maxDuration: 300s)
- /lib/linkedin-poster.ts           → LinkedIn text/image/video posting
- /lib/linkedin-queue.ts            → Supabase job queue helpers
- /lib/leads-agent.ts               → Claude-powered lead extraction from HTML
- /lib/telegram.ts                  → Telegram API wrapper (takes any bot token)
- /lib/bot-addressing.ts            → shared "is this group message meant for me" check (Pepe/Santi/Angeles all share one group chat)
- /lib/marketing-agent.ts           → Pepe agent (LinkedIn/Facebook/Instagram posting, Cloudinary image browsing)
- /lib/dev-agent.ts                 → Santi agent (CTO persona; reads/edits this repo via GitHub API, opens + merges PRs)
- /lib/github-dev.ts                → GitHub REST API wrapper used by Santi + Angeles (read/write files, branches, PRs)
- /lib/vercel-dev.ts                → Vercel REST API wrapper used by Santi (list_deployments, get_deployment_logs)
- /lib/product-agent.ts             → Angeles agent (CPO persona; read-only repo access, no write/posting ability)
- /lib/browser.ts                   → Browserbase (remote Chromium via CDP) screenshot helper used by Angeles's browse_page (internal dashboard, logged-in), browse_url (any public URL), and browse_social_search (screenshot + extracted post links, for Interactions discovery) tools
- /lib/token-usage.ts                → per-call Claude API token/cost logging (recordUsage, called after every messages.create across the agent libs) + dashboard aggregation (app/(dashboard)/costs)
- /lib/cloudinary.ts                → Cloudinary Admin API image listing + gallery uploads
- /lib/cloudinary-uploads.ts        → cloudinary_uploads table — name↔image mapping for Pepe's "upload" flow
- /lib/meta-poster.ts               → Facebook/Instagram posting
- /lib/interactions.ts              → "Interactions" feature — topics/settings/posts CRUD, per-platform daily-target backfill trigger (app/(dashboard)/interactions)
- /lib/interaction-fetch-queue.ts + /lib/process-interaction-fetches.ts → queue of "find one more post" requests Pepe fulfills via browse_social_search, drained by /api/cron/process-interaction-fetches every 5 minutes
- /lib/social-login.ts              → logs a Puppeteer page into LinkedIn/Instagram/Facebook (SOCIAL_LOGIN_USERNAME/PASSWORD) and persists the session's cookies in social_login_sessions, reusing them across calls instead of logging in fresh each time — used by browse_social_search, since these platforms show a login wall to anonymous sessions
- /lib/heygen.ts                    → HeyGen API wrapper (list avatars/voices, start video generation, poll status)
- /lib/video-jobs.ts + /lib/process-video-jobs.ts → video_jobs state machine (generating → processing_ig → posted/failed) ticked by /api/cron/process-video-jobs every 5 minutes; drives both Pepe's immediate create_video tool and a scheduled marketing_plan video post (see publish-post.ts)
- /lib/publish-post.ts              → single dispatch used by the post-schedule cron, the dashboard's manual "Retry", and Pepe's retry_post — branches on post_type: 'standard' posts go straight to LinkedIn/Facebook/Instagram, 'video' posts kick off HeyGen generation and hand off to process-video-jobs.ts
- /lib/marketing-plan.ts            → marketing_plan (the weekly Planner) CRUD — draft → approved → posted/failed/generating
- /supabase/migrations/             → SQL migrations

## Environment Variables
- TELEGRAM_BOT_TOKEN
- ANTHROPIC_API_KEY
- LINKEDIN_ACCESS_TOKEN
- LINKEDIN_AUTHOR_ID        # person:<id> or organization:<id>
- NEXT_PUBLIC_SUPABASE_URL
- SUPABASE_SERVICE_ROLE_KEY
- NEXT_PUBLIC_APP_URL       # e.g. https://marketing.vercel.app
- INTERNAL_SECRET           # guards /api/linkedin/process
- CLOUDINARY_CLOUD_NAME
- CLOUDINARY_API_KEY
- CLOUDINARY_API_SECRET
- CLOUDINARY_FOLDER         # folder containing marketing images
- CLOUDINARY_GALLERY_ROOT   # root folder for the dashboard gallery / Telegram uploads, defaults to "marketing/images"
- INSTAGRAM_PAGE_ACCESS_TOKEN
- INSTAGRAM_BUSINESS_ACCOUNT_ID
- FACEBOOK_PAGE_ID
- SANTI_BOT_TOKEN           # Telegram bot token for Santi (the dev/CTO bot)
- SANTI_GITHUB_TOKEN        # fine-grained PAT scoped to grupoyakgu/marketing (Contents + Pull requests: read/write) — also used by Angeles, read-only
- SANTI_OWNER_TELEGRAM_ID   # numeric Telegram user ID — Santi ignores messages from anyone else
- ANGELES_BOT_TOKEN         # Telegram bot token for Angeles (the CPO bot) — no owner restriction, anyone in the group can address her
- ANGELES_APP_USERNAME      # login for Angeles's dedicated read-only dashboard account (used by browse_page to screenshot live pages)
- ANGELES_APP_PASSWORD      # password for that same account
- BROWSERBASE_API_KEY       # remote-browser session API used by browse_page (running Chromium in-process on Vercel wasn't viable — see lib/browser.ts)
- BROWSERBASE_PROJECT_ID    # Browserbase project ID paired with the API key above
- BROWSERLESS_API_KEY       # 2nd remote-browser provider — connectRemoteBrowser() in lib/browser.ts tries Browserbase first, falls back through Browserless then Steel on failure (e.g. quota exhausted); optional, each unconfigured provider is just skipped
- BROWSERLESS_WS_URL        # optional override if the account's Browserless endpoint isn't wss://chrome.browserless.io (e.g. a region-specific or dedicated cluster)
- STEEL_API_KEY             # 3rd remote-browser provider (steel.dev), same fallback chain as above — optional
- SOCIAL_LOGIN_USERNAME     # shared login for the LinkedIn/Instagram/Facebook accounts browse_social_search authenticates as (see lib/social-login.ts) — same credentials across all three
- SOCIAL_LOGIN_PASSWORD     # password for that same shared login
- SANTI_VERCEL_TOKEN        # Vercel Access Token scoped to this team, used by list_deployments/get_deployment_logs
- HEYGEN_API_KEY            # HeyGen API key used by lib/heygen.ts (list avatars/voices, generate videos, poll status)
- HEYGEN_DEFAULT_AVATAR_ID  # fallback avatar for create_video / a scheduled video post when no avatar_id is given
- HEYGEN_DEFAULT_VOICE_ID   # fallback voice for create_video / a scheduled video post — there is no per-post voice override, only per-post avatar_id

## Telegram Commands
- /post linkedin <message>              — text post
- send photo + caption "/post linkedin" — image post (inline)
- send video + caption "/post linkedin" — video post (queued, 300s worker)
- send photo + caption "upload" (or "upload to <folder>") — saves the photo into the Cloudinary gallery under CLOUDINARY_GALLERY_ROOT; "upload" alone (or "upload to general") goes to the "general" subfolder, any other folder name is matched case-insensitively against existing subfolders or created new. Pepe then asks what to name the image (stored in cloudinary_uploads) so it can be referenced later ("use the sunset image") when asking him to build a post — find_named_image resolves the name back to the upload

## Rules
- Always use TypeScript
- Always handle errors gracefully
- Keep functions small and single-purpose
- RLS is NOT enabled on linkedin_queue (server-only access via service role key)
