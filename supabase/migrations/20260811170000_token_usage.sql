-- Per-call Claude API usage log, so the dashboard can show token spend and
-- USD cost broken down by agent (pepe/santi/angeles/abu/leads) and over
-- time. Populated by lib/token-usage.ts's recordUsage(), called after every
-- client.messages.create() across the agent libs -- one row per API call,
-- not per Telegram message (a single chat() turn can involve several calls
-- when tool use loops).
create table if not exists token_usage (
  id uuid primary key default gen_random_uuid(),
  agent text not null,
  model text not null,
  input_tokens integer not null default 0,
  output_tokens integer not null default 0,
  cache_creation_input_tokens integer not null default 0,
  cache_read_input_tokens integer not null default 0,
  cost_usd numeric(12, 6) not null default 0,
  chat_id bigint,
  created_at timestamptz not null default now()
);

create index if not exists token_usage_agent_created_idx on token_usage (agent, created_at);
create index if not exists token_usage_created_idx on token_usage (created_at);

notify pgrst, 'reload schema';
