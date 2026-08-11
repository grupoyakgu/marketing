import { getPostById, markPostStatus } from './marketing-plan';
import { postToLinkedIn } from './linkedin-poster';
import { postToFacebook, postToInstagram } from './meta-poster';
import { listCloudinaryImages } from './cloudinary';

export interface PublishResult {
  success: boolean;
  url?: string;
  error?: string;
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
