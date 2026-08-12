-- Serializes chat() turns per (chat_id, bot) -- see lib/chat-lock.ts. Without
-- this, an independent cron calling a bot's chat() directly (process-bot-
-- followups, process-bot-consultations, process-santi-delegations,
-- process-interaction-fetches) can race a live Telegram webhook's in-flight
-- turn for the same bot+chat, corrupting chat_history's strict
-- tool_use/tool_result adjacency -- a message landing between a saved
-- tool_use and its matching tool_result -- which Anthropic's API then
-- rejects on every future turn until the conversation is reset. Confirmed
-- happening in production: a process-bot-followups delivery landed mid-flight
-- during a slow browse_social_search call.

create table if not exists bot_chat_locks (
  chat_id bigint not null,
  bot text not null,
  locked_at timestamptz not null default now(),
  primary key (chat_id, bot)
);

-- p_stale_after_seconds lets a lock be stolen if its holder was hard-killed
-- (Vercel SIGKILL past maxDuration) before it could release -- the same
-- failure mode lib/chat-history.ts's repairOrphanedToolUse already defends
-- against for the tool_use/tool_result pair itself.
create or replace function acquire_bot_chat_lock(p_chat_id bigint, p_bot text, p_stale_after_seconds integer default 280)
returns boolean
language plpgsql
as $$
declare
  v_row bot_chat_locks;
begin
  -- Serializes the delete-stale-then-insert sequence below per (chat_id,
  -- bot) so two callers racing the same stale lock can't both pass the
  -- "no fresh row exists" check and both believe they acquired it.
  perform pg_advisory_xact_lock(hashtext(p_bot || ':' || p_chat_id::text));

  delete from bot_chat_locks
  where chat_id = p_chat_id and bot = p_bot
    and locked_at < now() - make_interval(secs => p_stale_after_seconds);

  insert into bot_chat_locks (chat_id, bot)
  values (p_chat_id, p_bot)
  on conflict (chat_id, bot) do nothing
  returning * into v_row;

  return v_row.chat_id is not null;
end;
$$;

create or replace function release_bot_chat_lock(p_chat_id bigint, p_bot text)
returns void
language sql
as $$
  delete from bot_chat_locks where chat_id = p_chat_id and bot = p_bot;
$$;

notify pgrst, 'reload schema';
