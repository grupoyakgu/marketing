create table if not exists tracked_posts (
  id uuid primary key default gen_random_uuid(),
  platform text not null check (platform in ('linkedin', 'instagram', 'facebook')),
  platform_post_id text not null,
  posted_at timestamptz not null default now(),
  unique (platform, platform_post_id)
);

notify pgrst, 'reload schema';
