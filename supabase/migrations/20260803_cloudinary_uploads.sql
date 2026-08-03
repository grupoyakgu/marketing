-- Images uploaded via Pepe's Telegram "upload" flow, so the user can later
-- reference an image by the friendly name they gave it (rather than a
-- Cloudinary URL/filename) when asking Pepe to build a post with it. `name`
-- starts null right after upload — the webhook asks what to call it, and the
-- very next plain-text message from that chat fills it in (see
-- getPendingUpload/nameUpload in lib/cloudinary-uploads.ts) — hence the
-- partial index over the still-unnamed rows that lookup uses.

create table if not exists cloudinary_uploads (
  id uuid primary key default gen_random_uuid(),
  chat_id bigint not null,
  folder text not null,
  public_id text not null,
  url text not null,
  name text,
  created_at timestamptz not null default now()
);

create index if not exists cloudinary_uploads_pending_idx
  on cloudinary_uploads (chat_id, created_at desc)
  where name is null;

create index if not exists cloudinary_uploads_name_idx
  on cloudinary_uploads (lower(name));

notify pgrst, 'reload schema';
