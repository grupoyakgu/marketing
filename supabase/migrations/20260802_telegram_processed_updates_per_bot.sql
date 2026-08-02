-- update_id is only unique within a single Telegram bot's own update stream —
-- a second bot (Santi) gets its own independently-numbered update_ids from
-- Telegram, starting low, which would collide with update_ids Pepe already
-- claimed long ago and silently drop Santi's messages as "duplicates".
-- Scopes the dedup key to (bot, update_id) instead.
alter table telegram_processed_updates add column if not exists bot text not null default 'pepe';
alter table telegram_processed_updates drop constraint if exists telegram_processed_updates_pkey;
alter table telegram_processed_updates add primary key (bot, update_id);
alter table telegram_processed_updates alter column bot drop default;
