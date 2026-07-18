-- Tracks when comment-checking last ran (hourly cron or the manual "Check
-- now" action in Settings), mirroring dashboard_refresh_status.

create table if not exists comment_check_status (
  id text primary key default 'singleton',
  checked_at timestamptz,
  comments_handled integer,
  thank_you_count integer,
  shoutout_count integer,
  skipped text
);

insert into comment_check_status (id)
values ('singleton')
on conflict (id) do nothing;

notify pgrst, 'reload schema';
