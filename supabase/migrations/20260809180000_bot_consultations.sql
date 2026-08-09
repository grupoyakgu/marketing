-- Generic inter-bot consultation + followup queues, replacing the
-- single-direction pepe_consultations (20260809_pepe_consultations.sql) and
-- angeles_followups (20260809150800_angeles_followups.sql). Those only
-- covered one pair (Angeles -> Pepe); now any of the three bots (pepe,
-- santi, angeles) can consult any other, so the queue needs from/to columns
-- instead of being named after a single fixed direction. santi_delegations
-- stays separate — it's actual shipping work, not an advisory exchange, and
-- keeps its own distinct approval semantics.
--
-- Same decoupled pattern as every other hop in this chain (see
-- santi_delegations.sql for the full rationale): a consult_* tool call just
-- records the brief here and returns immediately; process-bot-consultations
-- (every 5 minutes) claims it, runs the target bot's own chat() with its own
-- full budget, posts the reply into the shared group chat under its own
-- identity, and records a bot_followups row so the *asking* bot's own
-- conversation becomes aware of the answer (it has no other way to see a
-- teammate's reply — see bot-addressing.ts on why bot-authored messages
-- never resolve as addressed to another bot). process-bot-followups (every
-- 5 minutes) then runs that bot's chat() on the followup message.
--
-- The old pepe_consultations / angeles_followups tables are left in place
-- rather than dropped -- nothing references them after this migration, but
-- they're inert operational queue tables, not data worth a destructive
-- migration to remove.

create table if not exists bot_consultations (
  id uuid primary key default gen_random_uuid(),
  chat_id bigint not null,
  from_bot text not null check (from_bot in ('pepe', 'santi', 'angeles')),
  to_bot text not null check (to_bot in ('pepe', 'santi', 'angeles')),
  brief text not null,
  status text not null default 'pending' check (status in ('pending', 'processing', 'done', 'failed')),
  error text,
  created_at timestamptz not null default now(),
  completed_at timestamptz
);

create index if not exists bot_consultations_pending_idx
  on bot_consultations (created_at)
  where status = 'pending';

create table if not exists bot_followups (
  id uuid primary key default gen_random_uuid(),
  chat_id bigint not null,
  bot text not null check (bot in ('pepe', 'santi', 'angeles')),
  message text not null,
  status text not null default 'pending' check (status in ('pending', 'processing', 'done', 'failed')),
  error text,
  created_at timestamptz not null default now(),
  completed_at timestamptz
);

create index if not exists bot_followups_pending_idx
  on bot_followups (created_at)
  where status = 'pending';

notify pgrst, 'reload schema';
