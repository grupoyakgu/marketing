-- Tracks HeyGen video generation through Cloudinary upload and posting to
-- Instagram/Facebook. Generation and Instagram's own video processing both
-- take minutes, so this is a resumable state machine ticked by a cron rather
-- than one long-running request: generating -> (uploading happens inline once
-- HeyGen completes) -> processing_ig (Instagram only) -> posted | failed.

create table if not exists video_jobs (
  id uuid primary key default gen_random_uuid(),
  chat_id bigint,
  platform text not null check (platform in ('instagram', 'facebook')),
  caption text not null,
  heygen_video_id text not null,
  cloudinary_url text,
  ig_container_id text,
  status text not null default 'generating',
  error text,
  post_url text,
  created_at timestamptz not null default now()
);

notify pgrst, 'reload schema';
