import { getPostById, markPostStatus } from './marketing-plan';
import { postToLinkedIn } from './linkedin-poster';
import { postToFacebook, postToInstagram } from './meta-poster';
import { listCloudinaryImages } from './cloudinary';

export interface PublishResult {
  success: boolean;
  error?: string;
}

/** Publishes an existing marketing_plan post right now, reusing whatever
 * content/image/platform is already saved on it — shared by the hourly
 * cron, the dashboard's manual "Retry" action, and Pepe's retry_post tool,
 * so all three publish exactly the same way instead of duplicating this
 * per-platform dispatch three times. */
export async function publishPost(postId: string): Promise<PublishResult> {
  const post = await getPostById(postId);
  if (!post) return { success: false, error: 'Post not found.' };
  if (post.status === 'posted') return { success: false, error: 'This post has already been posted.' };

  let imageUrl = post.image_url || undefined;
  if (!imageUrl) {
    try {
      const images = await listCloudinaryImages();
      if (images.length > 0) imageUrl = images[0].url;
    } catch {}
  }

  let result: { success: boolean; postId?: string; url?: string; error?: string } | undefined;
  if (post.platform === 'linkedin') {
    result = await postToLinkedIn(post.content, imageUrl);
  } else if (post.platform === 'facebook') {
    result = await postToFacebook(post.content, imageUrl);
  } else if (post.platform === 'instagram') {
    if (!imageUrl) {
      await markPostStatus(post.id!, 'failed');
      return { success: false, error: 'No image available for Instagram.' };
    }
    result = await postToInstagram(post.content, imageUrl);
  }

  if (result?.success) {
    await markPostStatus(post.id!, 'posted', result.url, result.postId);
    return { success: true };
  }
  await markPostStatus(post.id!, 'failed');
  return { success: false, error: result?.error ?? 'Unknown error.' };
}
