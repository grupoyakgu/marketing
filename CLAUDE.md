# Marketing Agent

## Stack
- Next.js 14 (App Router)
- Vercel serverless functions
- Telegram Bot API (webhook mode)
- Anthropic SDK (claude-sonnet-4-6)
- Supabase (job queue)
- LinkedIn UGC Posts API

## Project Structure
- /app/api/telegram/route.ts        → Pepe's webhook handler (maxDuration: 60s)
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
- /lib/browser.ts                   → Browserbase (remote Chromium via CDP) screenshot helper used by Angeles's browse_page tool
- /lib/cloudinary.ts                → Cloudinary Admin API image listing + gallery uploads
- /lib/meta-poster.ts               → Facebook/Instagram posting
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
- SANTI_VERCEL_TOKEN        # Vercel Access Token scoped to this team, used by list_deployments/get_deployment_logs

## Telegram Commands
- /post linkedin <message>              — text post
- send photo + caption "/post linkedin" — image post (inline)
- send video + caption "/post linkedin" — video post (queued, 300s worker)
- send photo + caption "upload" (or "upload to <folder>") — saves the photo into the Cloudinary gallery under CLOUDINARY_GALLERY_ROOT; "upload" alone (or "upload to general") goes to the root "General" bucket, any other folder name is matched case-insensitively against existing subfolders or created new

## Rules
- Always use TypeScript
- Always handle errors gracefully
- Keep functions small and single-purpose
- RLS is NOT enabled on linkedin_queue (server-only access via service role key)
