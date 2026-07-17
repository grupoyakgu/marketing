-- Tracks which engagement milestones have already been triggered per post
create table if not exists post_milestones (
  id uuid primary key default gen_random_uuid(),
  platform text not null,
  platform_post_id text not null,
  milestone text not null,
  triggered_at timestamptz not null default now(),
  unique (platform, platform_post_id, milestone)
);

notify pgrst, 'reload schema';
