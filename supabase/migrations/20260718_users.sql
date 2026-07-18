create table if not exists users (
  id uuid primary key default gen_random_uuid(),
  username text not null unique,
  password_hash text not null,
  role text not null check (role in ('admin', 'user')),
  disabled boolean not null default false,
  created_at timestamptz not null default now()
);

notify pgrst, 'reload schema';
