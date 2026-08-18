-- Lets a HeyGen video job target LinkedIn, not just Instagram/Facebook --
-- process-video-jobs.ts posts a LinkedIn video the same single-step way it
-- already posts to Facebook (lib/linkedin-poster.ts's
-- postVideoToLinkedInFromUrl), so no new status value is needed alongside
-- the existing 'processing_ig' (Instagram-only, for its async container
-- polling).
alter table video_jobs drop constraint if exists video_jobs_platform_check;
alter table video_jobs add constraint video_jobs_platform_check
  check (platform in ('instagram', 'facebook', 'linkedin'));

notify pgrst, 'reload schema';
