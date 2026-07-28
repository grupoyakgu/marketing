-- The tracked-hashtags list used to live only in the INSTAGRAM_TRACKED_HASHTAGS
-- env var, which meant only a redeploy could change it — Pepe has no way to
-- touch Vercel config. Moving it into the database lets Pepe add hashtags it
-- finds worth tracking, with the change showing up in the /hashtags dashboard
-- immediately (next refresh), no deploy involved.

create table if not exists tracked_hashtags (
  tag text primary key,
  added_at timestamptz not null default now()
);

notify pgrst, 'reload schema';
