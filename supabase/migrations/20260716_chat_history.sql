create table if not exists chat_history (
  id uuid primary key default gen_random_uuid(),
  chat_id bigint not null,
  bot text not null,
  role text not null check (role in ('user', 'assistant')),
  content text not null,
  created_at timestamptz not null default now()
);

create index if not exists chat_history_lookup_idx on chat_history (chat_id, bot, created_at);
