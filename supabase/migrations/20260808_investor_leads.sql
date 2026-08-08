-- Leads captured from the public multi-language investor landing page
-- (/invest/[locale]) for the AT Sevilla project. Public-facing form, so
-- writes go through the service role key from the API route rather than
-- direct client access — no RLS needed, same pattern as linkedin_queue.

create table if not exists investor_leads (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  email text not null,
  mobile text not null,
  locale text not null,
  created_at timestamptz not null default now()
);

create index if not exists investor_leads_created_at_idx
  on investor_leads (created_at desc);

notify pgrst, 'reload schema';
