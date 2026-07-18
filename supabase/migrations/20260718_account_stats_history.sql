create table if not exists account_stats_history (
  id uuid primary key default gen_random_uuid(),
  platform text not null check (platform in ('linkedin', 'instagram', 'facebook')),
  followers integer not null,
  captured_at timestamptz not null default now()
);

create index if not exists account_stats_history_lookup_idx on account_stats_history (platform, captured_at);

notify pgrst, 'reload schema';
