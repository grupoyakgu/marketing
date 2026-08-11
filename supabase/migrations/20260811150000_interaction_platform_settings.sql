-- Replaces the singleton interaction_settings (one daily_count shared across
-- all platforms) with a per-platform daily target, since the actual
-- discovery success rate differs a lot by platform (login walls, content
-- availability) and the user wants distinct limits per platform.

create table if not exists interaction_platform_settings (
  platform text primary key check (platform = any (array['linkedin', 'facebook', 'instagram'])),
  daily_count integer not null default 3,
  updated_at timestamptz not null default now()
);

insert into interaction_platform_settings (platform, daily_count) values
  ('linkedin', 2),
  ('facebook', 4),
  ('instagram', 5)
on conflict (platform) do update set daily_count = excluded.daily_count, updated_at = now();

drop table if exists interaction_settings;

notify pgrst, 'reload schema';
