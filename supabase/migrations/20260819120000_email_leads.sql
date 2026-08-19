-- Tracks Persuadis (leads@persuadis.com) contact-form leads received by email
-- so process-email-leads.ts can dedupe (one row per Gmail message id) and
-- record whether Pepe already notified the group chat and/or replied to the
-- lead's own email address.

create table if not exists email_leads (
  id uuid primary key default gen_random_uuid(),
  gmail_message_id text not null unique,
  name text,
  apellidos text,
  phone text,
  email text,
  mensaje text,
  utm_campaign text,
  notified_at timestamptz,
  replied_at timestamptz,
  reply_error text,
  created_at timestamptz not null default now()
);

insert into cron_settings (id, path, name, schedule, description) values
  ('process-email-leads', '/api/cron/process-email-leads', 'Process Email Leads', '*/5 * * * *', 'Checks for new Persuadis contact-form leads by email, notifies Pepe''s chat, and sends the lead a warm auto-reply.')
on conflict (id) do nothing;

notify pgrst, 'reload schema';
