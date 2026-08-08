-- Per-locale content overrides for /invest/[locale] (the investor landing
-- page). Copy starts out hardcoded in app/invest/[locale]/copy.ts as the
-- default/fallback for every field; a row here holds only the fields Pepe
-- has actually edited via chat, layered on top of those defaults at render
-- time — so the page still renders correctly with zero rows, and an edit
-- shows up immediately without a code deploy.

create table if not exists landing_page_copy (
  locale text primary key,
  overrides jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now()
);

notify pgrst, 'reload schema';
