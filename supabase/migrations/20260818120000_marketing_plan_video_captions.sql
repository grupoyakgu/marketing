-- Per-post opt-out for HeyGen captions on a video post (post_type 'video').
-- Defaults to true (captions on) so existing/未-set rows and any insert that
-- omits the field keep the new default behavior in lib/heygen.ts's
-- createVideo -- only an explicit false suppresses them. See publish-post.ts,
-- which reads this at the post's scheduled generation time.
alter table marketing_plan add column if not exists captions boolean not null default true;

notify pgrst, 'reload schema';
