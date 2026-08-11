-- "Interactions" feature: a daily-refreshed pool of other people's/pages'
-- public posts (per platform) worth commenting on, discovered by Pepe from
-- topics of interest and browsed via his existing browse_url tool (there is
-- no real third-party post-search API for any of these platforms).
--
-- Same no-RLS/service-role-key-only pattern as the rest of this project's
-- tables (investor_leads, page_events, link_clicks, ...).

-- Topics Pepe should look for posts about — added by either the user (via
-- the dashboard) or Pepe himself (via the add_interaction_topic tool).
create table if not exists interaction_topics (
  id uuid primary key default gen_random_uuid(),
  topic text not null,
  added_by text not null check (added_by = any (array['user', 'pepe'])),
  created_at timestamptz not null default now()
);

-- Singleton row holding the per-platform daily target count.
create table if not exists interaction_settings (
  id text primary key default 'singleton',
  daily_count integer not null default 3,
  updated_at timestamptz not null default now()
);
insert into interaction_settings (id) values ('singleton') on conflict (id) do nothing;

-- Discovered posts. Hard-deleted (not soft-deleted) when the user removes one
-- as irrelevant — "removed" doesn't need to persist anywhere, unlike "done"
-- which stays visible behind the show-done toggle.
create table if not exists interaction_posts (
  id uuid primary key default gen_random_uuid(),
  platform text not null check (platform = any (array['linkedin', 'facebook', 'instagram'])),
  url text not null,
  author text,
  content_preview text,
  topic text,
  likes integer,
  comments integer,
  shares integer,
  status text not null default 'active' check (status = any (array['active', 'done'])),
  discovered_at timestamptz not null default now(),
  done_at timestamptz
);

create index if not exists interaction_posts_platform_status_idx
  on interaction_posts (platform, status);

-- Queue of "go find one more post for this platform" requests — drained by
-- /api/cron/process-interaction-fetches every 5 minutes, same shape as
-- santi_delegations/bot_followups. Inserted either immediately (deleting a
-- post drops a platform below target) or by the daily refresh cron.
create table if not exists interaction_fetch_requests (
  id uuid primary key default gen_random_uuid(),
  platform text not null check (platform = any (array['linkedin', 'facebook', 'instagram'])),
  status text not null default 'pending' check (status = any (array['pending', 'processing', 'done', 'failed'])),
  error text,
  created_at timestamptz not null default now(),
  completed_at timestamptz
);

notify pgrst, 'reload schema';
