import { getPostById, markPostStatus, getMostRecentPepeChatId } from './marketing-plan';
import { postToLinkedIn } from './linkedin-poster';
import { postToFacebook, postToInstagram } from './meta-poster';
import { listCloudinaryImages } from './cloudinary';
import { createVideo } from './heygen';
import { createVideoJob } from './video-jobs';

export interface PublishResult {
  success: boolean;
  url?: string;
  error?: string;
  /** True when "success" only means a background job was started (video
   * generation) rather than the post actually being live yet -- callers
   * should say so rather than reporting it as posted. */
  pending?: boolean;
}

/** Publishes an existing marketing_plan post right now, reusing whatever
 * content/image/platform is already saved on it — shared by the hourly
 * cron, the dashboard's manual "Retry" action, and Pepe's retry_post tool,
 * so all three publish exactly the same way instead of duplicating this
 * per-platform dispatch three times.
 *
 * Only 'approved' or 'failed' posts can go out. The hourly cron only ever
 * calls this with already-approved posts, and the dashboard's Retry button
 * only renders for 'failed' ones, but neither of those is enforcement --
 * the dashboard route and Pepe's retry_post tool both call this directly
 * with a bare post_id, so a draft could otherwise be published without
 * ever being approved. */
export async function publishPost(postId: string): Promise<PublishResult> {
  const post = await getPostById(postId);
  if (!post) return { success: false, error: 'Post not found.' };
  if (post.status === 'posted') return { success: false, error: 'This post has already been posted.' };
  if (post.status !== 'approved' && post.status !== 'failed') {
    return {
      success: false,
      error: `This post is still '${post.status}' -- only approved or previously-failed posts can be published. Approve it first.`,
    };
  }

  if (post.post_type === 'video') {
    if (post.platform === 'linkedin') {
      await markPostStatus(post.id!, 'failed');
      return { success: false, error: 'HeyGen video posts only support Instagram or Facebook, not LinkedIn.' };
    }
    if (!post.video_script) {
      await markPostStatus(post.id!, 'failed');
      return { success: false, error: 'This video post has no video_script to generate from.' };
    }

    const motionPrompt = post.motion_prompt || 'Natural, relaxed, and animated — move hands, arms, and upper body fluidly and naturally while speaking, as if explaining something to a colleague in person, with all visible body parts in motion rather than staying static.';
    // captions defaults to true at the DB column level (see the
    // marketing_plan_video_captions migration), so post.captions is only
    // ever false when a caller explicitly set it that way.
    const created = await createVideo(post.video_script, post.avatar_id ?? undefined, undefined, motionPrompt, post.captions);
    if (created.error || !created.videoId) {
      const error = created.error ?? 'HeyGen did not return a video_id.';
      console.error(`[publishPost] video generation failed for post ${post.id}: ${error}`);
      await markPostStatus(post.id!, 'failed');
      return { success: false, error };
    }

    // Generation and posting happen in the background (process-video-jobs.ts,
    // ticked by the process-video-jobs cron) -- this call only starts it.
    // Status goes to 'generating' rather than back to 'approved' so
    // getPostsDueNow doesn't pick the same post up again next tick while
    // it's still rendering; process-video-jobs.ts moves it on to 'posted' or
    // 'failed' once the job actually finishes.
    const chatId = await getMostRecentPepeChatId();
    await createVideoJob({
      chatId,
      platform: post.platform,
      caption: post.content,
      heygenVideoId: created.videoId,
      planPostId: post.id,
      avatarId: post.avatar_id ?? null,
      overlayImageUrl: post.overlay_image_url ?? null,
    });
    await markPostStatus(post.id!, 'generating');
    return { success: true, pending: true };
  }

  let imageUrls = (post.image_urls ?? []).filter(Boolean);
  if (imageUrls.length === 0 && post.image_url) imageUrls = [post.image_url];
  if (imageUrls.length === 0) {
    try {
      const images = await listCloudinaryImages();
      if (images.length > 0) imageUrls = [images[0].url];
    } catch {}
  }

  let result: { success: boolean; postId?: string; url?: string; error?: string } | undefined;
  if (post.platform === 'linkedin') {
    result = await postToLinkedIn(post.content, imageUrls);
  } else if (post.platform === 'facebook') {
    result = await postToFacebook(post.content, imageUrls);
  } else if (post.platform === 'instagram') {
    if (imageUrls.length === 0) {
      await markPostStatus(post.id!, 'failed');
      return { success: false, error: 'No image available for Instagram.' };
    }
    result = await postToInstagram(post.content, imageUrls);
  }

  if (result?.success) {
    await markPostStatus(post.id!, 'posted', result.url, result.postId);
    return { success: true, url: result.url };
  }
  const error = result?.error ?? 'Unknown error.';
  // The only other record of a failure is whatever surfaces to the caller
  // (a Telegram message from the cron, a toast in the dashboard) — once
  // that's gone, the actual platform error was gone for good. Logging it
  // here means it's diagnosable from Vercel logs (or Santi's
  // get_deployment_logs) regardless of which of the three callers hit it.
  console.error(`[publishPost] ${post.platform} post ${post.id} failed: ${error}`);
  await markPostStatus(post.id!, 'failed');
  return { success: false, error };
}
