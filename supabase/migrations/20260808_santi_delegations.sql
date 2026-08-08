-- Tasks Angeles hands to Santi via delegate_to_santi. Previously she ran
-- Santi's entire multi-step tool loop (read code, write files, open + merge
-- a PR) synchronously inline in her own request, sharing her route's 300s
-- maxDuration -- for anything substantial (multi-file edits), that budget
-- also had to cover her own preceding investigation (browse_page, read_file
-- calls), leaving Santi's nested call less room than he gets on his own
-- dedicated route. Confirmed in production: a real multi-part landing-page
-- edit request timed out at delegate_to_santi's 180s ceiling with nothing
-- delivered.
--
-- Now delegate_to_santi just records the task here and returns immediately;
-- a cron (process-santi-delegations, every 5 minutes) claims and runs it
-- with Santi's own full budget, completely decoupled from Angeles's request.

create table if not exists santi_delegations (
  id uuid primary key default gen_random_uuid(),
  chat_id bigint not null,
  instructions text not null,
  status text not null default 'pending' check (status in ('pending', 'processing', 'done', 'failed')),
  error text,
  created_at timestamptz not null default now(),
  completed_at timestamptz
);

create index if not exists santi_delegations_pending_idx
  on santi_delegations (created_at)
  where status = 'pending';

notify pgrst, 'reload schema';
