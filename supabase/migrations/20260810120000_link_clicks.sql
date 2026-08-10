-- Logs a click on an outbound tracked link (e.g. a LinkedIn/Instagram post
-- pointing at /go/[locale]) before it redirects into the investor landing
-- page (/invest/[locale]). This is the funnel step upstream of page_events —
-- page_events only fires once the landing page itself has loaded, so it can't
-- capture a click that never resulted in a page load. Written from the /go
-- redirect route via the service role key, same no-RLS pattern as
-- page_events/investor_leads.

create table if not exists link_clicks (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  landing_page text not null,
  locale text not null,
  utm_source text,
  utm_medium text,
  utm_campaign text
);

create index if not exists link_clicks_created_at_idx
  on link_clicks (created_at desc);

notify pgrst, 'reload schema';
