-- All-time paid (Meta Ads) engagement for organic posts that have also run
-- as a boosted campaign, keyed by the post's own normalized permalink --
-- the only thing a Marketing API campaign and an organic post record share
-- (see lib/meta-ads.ts normalizePostUrl). Populated by the same daily
-- refresh cron that fills post_engagement_cache (lib/dashboard-refresh.ts),
-- read by the Performance page to show paid likes/comments/shares/spend as
-- a separate column -- deliberately never folded into the organic
-- composite score in lib/engagement.ts's scorePerformance.

create table if not exists paid_post_stats (
  post_url text primary key,
  spend numeric not null default 0,
  likes integer not null default 0,
  comments integer not null default 0,
  shares integer not null default 0,
  impressions integer not null default 0,
  reach integer not null default 0,
  updated_at timestamptz not null default now()
);

notify pgrst, 'reload schema';
