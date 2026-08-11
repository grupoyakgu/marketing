-- Persisted cookie jar per platform for the Interactions feature's
-- authenticated browsing (see lib/social-login.ts). Logging in fresh on
-- every browse_social_search call would mean far more interactive logins
-- than necessary — a much stronger anti-bot signal than reusing one session
-- repeatedly — so a successful login's cookies are saved here and reused
-- until they stop working, only then triggering a fresh login.

create table if not exists social_login_sessions (
  platform text primary key check (platform = any (array['linkedin', 'facebook', 'instagram'])),
  cookies jsonb not null,
  updated_at timestamptz not null default now()
);

notify pgrst, 'reload schema';
