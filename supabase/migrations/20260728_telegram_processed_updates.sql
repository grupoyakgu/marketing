-- Telegram retries a webhook delivery if it doesn't get a fast response — a
-- slow turn (e.g. a hung tool call) can take long enough that the same
-- update_id arrives twice, running two concurrent /api/telegram invocations
-- that race on the same chat_history rows and corrupt the tool_use/tool_result
-- pairing Claude's API requires. Claiming update_id here first makes a
-- duplicate delivery a no-op instead of a second full run.
create table if not exists telegram_processed_updates (
  update_id bigint primary key,
  processed_at timestamptz not null default now()
);
