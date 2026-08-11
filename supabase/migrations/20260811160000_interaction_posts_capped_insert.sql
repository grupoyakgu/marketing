-- Enforces the per-platform daily_count as a hard ceiling on interaction_posts,
-- atomically. Without this, the invariant only held as long as nothing raced:
-- queueBackfillIfNeeded (lib/interactions.ts) reads existing+open counts and
-- then queues a shortfall, but two callers computing that shortfall at the
-- same time (e.g. deleting two posts back to back, or the daily refresh cron
-- overlapping a delete) can each queue enough requests to fill the gap alone,
-- over-queueing. Lowering a platform's daily_count while requests are already
-- queued has the same effect. Over-queueing was harmless on its own, but
-- nothing stopped every one of those requests from successfully adding a
-- post, pushing the platform over its target. This function is the only
-- insert path into interaction_posts (see addPost in lib/interactions.ts), so
-- gating it here holds the limit regardless of how many requests got queued.
create or replace function add_interaction_post_capped(
  p_platform text,
  p_url text,
  p_author text,
  p_content_preview text,
  p_topic text,
  p_likes integer,
  p_comments integer,
  p_shares integer
) returns interaction_posts
language plpgsql
as $$
declare
  v_target integer;
  v_count integer;
  v_row interaction_posts;
begin
  -- Serializes concurrent inserts for the same platform so the count check
  -- below and the insert are effectively one atomic step, even though
  -- Postgres can't express "check then insert" as a single statement here.
  perform pg_advisory_xact_lock(hashtext(p_platform));

  select daily_count into v_target
  from interaction_platform_settings
  where platform = p_platform;

  if v_target is null then
    raise exception 'No daily target configured for platform %', p_platform;
  end if;

  -- Matches countPosts() in lib/interactions.ts: active + done both count
  -- against the target, only a delete frees up a slot.
  select count(*) into v_count
  from interaction_posts
  where platform = p_platform;

  if v_count >= v_target then
    raise exception 'DAILY_LIMIT_REACHED: % already has % of % daily posts'
      , p_platform, v_count, v_target
      using errcode = 'P0001';
  end if;

  insert into interaction_posts (platform, url, author, content_preview, topic, likes, comments, shares)
  values (p_platform, p_url, p_author, p_content_preview, p_topic, p_likes, p_comments, p_shares)
  returning * into v_row;

  return v_row;
end;
$$;

notify pgrst, 'reload schema';
