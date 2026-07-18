-- Persists incoming comments and Pepe's replies so the dashboard can show
-- comment history instead of only the live, ephemeral fetch done during a
-- check-comments run. comment_replies (existing table) remains the dedup
-- guard that decides whether a comment still needs a reply; this table is
-- purely a display/history record of what was seen and how it was answered.

create table if not exists comment_log (
  id uuid primary key default gen_random_uuid(),
  platform text not null check (platform in ('linkedin', 'instagram', 'facebook')),
  comment_id text not null,
  post_id text not null,
  author_name text,
  comment_text text not null,
  comment_created_at timestamptz,
  replied boolean not null default false,
  reply_text text,
  replied_at timestamptz,
  created_at timestamptz not null default now(),
  unique (platform, comment_id)
);

create index if not exists comment_log_created_idx on comment_log (created_at desc);

notify pgrst, 'reload schema';
