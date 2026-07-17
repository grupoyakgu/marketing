-- Track platform post IDs so we can fetch comments
alter table marketing_plan add column if not exists platform_post_id text;

-- Track which comments we've already replied to
create table if not exists comment_replies (
  comment_id text primary key,
  platform text not null,
  replied_at timestamptz not null default now()
);

notify pgrst, 'reload schema';
