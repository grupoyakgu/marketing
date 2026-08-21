-- Adds the 'demo' role (read-only dashboard access, settings/costs/hashtags/
-- interactions hidden -- enforced in middleware.ts, not here) and a
-- last_login_at column so Settings > Users can show when each user last
-- signed in (set in app/api/auth/login/route.ts on successful login).

alter table users drop constraint if exists users_role_check;
alter table users add constraint users_role_check check (role in ('admin', 'user', 'demo'));

alter table users add column if not exists last_login_at timestamptz;

notify pgrst, 'reload schema';
