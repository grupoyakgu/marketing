-- Custom display names for Meta ad accounts, editable from the /ads dashboard
-- instead of relying on Meta's own account name — often unhelpful for a
-- personal ad account, which just returns the bare numeric account_id.

create table if not exists ad_account_labels (
  account_id text primary key,
  label text not null,
  updated_at timestamptz not null default now()
);

notify pgrst, 'reload schema';
