-- Queue for broadcastToTeammates (lib/chat-history.ts). A first version of
-- cross-bot awareness wrote a teammate's reply straight into the target
-- bot's chat_history at send time. That corrupted a live Santi conversation
-- in production: the write raced with Santi's own concurrent turn and
-- landed between one of his tool_use saves and its matching tool_result
-- save, breaking the strict adjacency Anthropic's API requires and making
-- every later turn 400 until history was hand-repaired.
--
-- This table decouples "a teammate posted" from "when it gets delivered".
-- broadcastToTeammates just records it here; each bot drains its own queue
-- (drainBroadcasts) at the very start of its own next chat() turn, before
-- that turn's own messages exist -- a point only it controls, so delivery
-- can only ever append safely after its last complete exchange, never in
-- the middle of one.

create table if not exists bot_broadcasts (
  id uuid primary key default gen_random_uuid(),
  chat_id bigint not null,
  from_bot text not null check (from_bot in ('pepe', 'santi', 'angeles')),
  to_bot text not null check (to_bot in ('pepe', 'santi', 'angeles')),
  text text not null,
  created_at timestamptz not null default now()
);

create index if not exists bot_broadcasts_pending_idx
  on bot_broadcasts (chat_id, to_bot, created_at);

notify pgrst, 'reload schema';
