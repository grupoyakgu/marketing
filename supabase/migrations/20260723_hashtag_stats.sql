-- Caches Instagram Hashtag Search results. hashtag_id is permanent once
-- discovered (Meta never changes it), so it's never re-looked-up — only the
-- media stats (media_count/avg_likes/avg_comments/top_posts) get refreshed.
-- This matters because hashtag *discovery* (ig_hashtag_search) is capped at
-- 30 unique hashtags per rolling 7 days per Instagram Business Account, while
-- reading top_media for an already-known hashtag id is not subject to that cap.

create table if not exists hashtag_stats (
  tag text primary key,
  hashtag_id text not null,
  media_count integer not null default 0,
  avg_likes numeric not null default 0,
  avg_comments numeric not null default 0,
  top_posts jsonb not null default '[]'::jsonb,
  fetched_at timestamptz not null default now()
);

notify pgrst, 'reload schema';
