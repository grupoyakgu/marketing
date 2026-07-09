create table if not exists linkedin_queue (
  id uuid primary key default gen_random_uuid(),
  chat_id bigint not null,
  text text not null,
  file_id text,
  media_type text check (media_type in ('IMAGE', 'VIDEO')),
  status text not null default 'pending' check (status in ('pending', 'processing', 'done', 'error')),
  error_message text,
  created_at timestamptz not null default now()
);

create index if not exists linkedin_queue_status_idx on linkedin_queue (status, created_at);
