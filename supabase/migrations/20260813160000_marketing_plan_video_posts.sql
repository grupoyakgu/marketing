-- Lets a marketing_plan post be a HeyGen video instead of a text/image post,
-- scheduled and approved through the exact same Planner flow. video_script is
-- what the avatar says (distinct from content, which stays the platform
-- caption); avatar_id lets each video post use a different HeyGen avatar
-- look. 'generating' is a new status: publishPost sets it once HeyGen
-- generation has been kicked off for a due video post, so getPostsDueNow's
-- status = 'approved' filter won't pick the same post up again on the next
-- tick while it's still rendering -- process-video-jobs.ts moves it on to
-- 'posted' or 'failed' once the background job actually finishes.
alter table marketing_plan drop constraint if exists marketing_plan_status_check;
alter table marketing_plan add constraint marketing_plan_status_check
  check (status in ('draft', 'approved', 'posted', 'failed', 'generating'));

alter table marketing_plan add column if not exists post_type text not null default 'standard'
  check (post_type in ('standard', 'video'));
alter table marketing_plan add column if not exists video_script text;
alter table marketing_plan add column if not exists avatar_id text;

-- Links a video job back to the marketing_plan row it was scheduled from, so
-- process-video-jobs.ts can update that specific post's status once the
-- video actually posts (or fails) instead of only recording a standalone
-- tracked_posts/marketing_plan entry as it does for an ad-hoc create_video
-- call with no plan post behind it. Null for exactly that ad-hoc case.
alter table video_jobs add column if not exists plan_post_id uuid references marketing_plan(id);
alter table video_jobs add column if not exists avatar_id text;

notify pgrst, 'reload schema';
