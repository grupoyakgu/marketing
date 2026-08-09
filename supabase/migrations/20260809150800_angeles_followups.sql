-- Feeds a teammate's reply back into Angeles's own conversation, mirroring
-- pepe_consultations / santi_delegations (see those migrations for the full
-- rationale on the decoupled pattern). Without this, consult_pepe was a
-- one-way trip: Angeles sends Pepe a brief, he replies in the shared chat
-- as himself, but nothing ever tells *her* he answered -- her own
-- conversation just sits there unaware, waiting indefinitely. Confirmed in
-- production: Angeles said she was waiting on Pepe well after he'd already
-- posted his reply.
--
-- process-pepe-consultations records a followup here once Pepe's reply is
-- ready; a separate cron (process-angeles-followups, every 5 minutes) runs
-- Angeles's normal chat() loop with the reply as an incoming message, with
-- her own full budget -- decoupled from Pepe's cron tick for the same
-- maxDuration reason every other hop in this chain is decoupled: a single
-- turn can legitimately take up to ~220s, and Pepe's own turn may have
-- already used most of that cron invocation's budget.

create table if not exists angeles_followups (
  id uuid primary key default gen_random_uuid(),
  chat_id bigint not null,
  message text not null,
  status text not null default 'pending' check (status in ('pending', 'processing', 'done', 'failed')),
  error text,
  created_at timestamptz not null default now(),
  completed_at timestamptz
);

create index if not exists angeles_followups_pending_idx
  on angeles_followups (created_at)
  where status = 'pending';

notify pgrst, 'reload schema';
