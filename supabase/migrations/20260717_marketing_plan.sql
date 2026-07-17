create table if not exists marketing_plan (
  id uuid primary key default gen_random_uuid(),
  week_start date not null,
  platform text not null check (platform in ('linkedin', 'instagram', 'facebook')),
  scheduled_date date not null,
  scheduled_time time not null,
  content text not null,
  image_note text,
  status text not null default 'draft' check (status in ('draft', 'approved', 'posted', 'failed')),
  post_url text,
  created_at timestamptz not null default now()
);

create index if not exists marketing_plan_week_idx on marketing_plan (week_start, status);
create index if not exists marketing_plan_schedule_idx on marketing_plan (scheduled_date, scheduled_time, status);
