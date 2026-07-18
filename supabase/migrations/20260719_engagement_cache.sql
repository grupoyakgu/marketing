-- Cache tables so the dashboard reads pre-fetched engagement/follower data
-- instead of calling Facebook/Instagram/LinkedIn live on every page load.
-- Populated by a daily cron and an on-demand "Refresh now" action (see
-- lib/dashboard-refresh.ts).

create table if not exists post_engagement_cache (
  platform text not null,
  platform_post_id text not null,
  likes integer not null default 0,
  comments integer not null default 0,
  shares integer not null default 0,
  impressions integer not null default 0,
  reach integer not null default 0,
  updated_at timestamptz not null default now(),
  primary key (platform, platform_post_id)
);

create table if not exists dashboard_refresh_status (
  id text primary key default 'singleton',
  refreshed_at timestamptz,
  duration_ms integer,
  posts_refreshed integer,
  accounts_refreshed integer
);

insert into dashboard_refresh_status (id)
values ('singleton')
on conflict (id) do nothing;

notify pgrst, 'reload schema';
