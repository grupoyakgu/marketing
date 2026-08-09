-- Marketing-take requests Angeles hands to Pepe via consult_pepe, mirroring
-- santi_delegations (see 20260808_santi_delegations.sql for the full
-- rationale). A single Pepe turn can legitimately take up to ~220s
-- (lib/marketing-agent.ts), which combined with Angeles's own preceding
-- investigation (browse_page, read_file) risks blowing her route's 300s
-- maxDuration if run inline. consult_pepe just records the brief here and
-- returns immediately; a cron (process-pepe-consultations, every 5 minutes)
-- claims it and runs Pepe's chat() with his own full budget, then posts his
-- reply into the shared group chat using his own bot token so it reads as
-- him actually chiming in.

create table if not exists pepe_consultations (
  id uuid primary key default gen_random_uuid(),
  chat_id bigint not null,
  brief text not null,
  status text not null default 'pending' check (status in ('pending', 'processing', 'done', 'failed')),
  error text,
  created_at timestamptz not null default now(),
  completed_at timestamptz
);

create index if not exists pepe_consultations_pending_idx
  on pepe_consultations (created_at)
  where status = 'pending';

notify pgrst, 'reload schema';
