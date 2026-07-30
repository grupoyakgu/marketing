-- Tracks when the user last viewed the /comments dashboard page, so a red
-- notification dot can be shown in the header while new comments have
-- arrived since then (comment_log.created_at is already recorded whenever
-- comment-check finds a new one). Single global marker, mirroring
-- dashboard_refresh_status / comment_check_status rather than per-user state.

create table if not exists comment_view_status (
  id text primary key default 'singleton',
  viewed_at timestamptz
);

insert into comment_view_status (id)
values ('singleton')
on conflict (id) do nothing;

notify pgrst, 'reload schema';
