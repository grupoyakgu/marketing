-- Lets Pepe layer an image (e.g. a logo watermark) onto a HeyGen-generated
-- video via a Cloudinary layer transformation (see lib/cloudinary.ts's
-- buildVideoOverlayUrl). marketing_plan.overlay_image_url is the source of
-- truth for a scheduled video post (post_type 'video'); publish-post.ts
-- copies it onto the video_jobs row at generation time, which is what
-- process-video-jobs.ts actually reads when compositing the final video URL
-- -- video_jobs also needs its own column since an ad-hoc create_video call
-- (no marketing_plan row behind it) goes straight there.
alter table marketing_plan add column if not exists overlay_image_url text;
alter table video_jobs add column if not exists overlay_image_url text;

notify pgrst, 'reload schema';
