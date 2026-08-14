import { getPendingVideoJobs, updateVideoJob, type VideoJob } from './video-jobs';
import { getVideoStatus } from './heygen';
import { uploadVideoFromUrl } from './cloudinary';
import {
  postVideoToFacebook,
  createInstagramVideoContainer,
  checkInstagramContainer,
  publishInstagramContainer,
} from './meta-poster';
import { trackDirectPost, recordDirectPostInPlan, markPostStatus } from './marketing-plan';

async function sendTelegramMessage(chatId: number, text: string) {
  const token = process.env.TELEGRAM_BOT_TOKEN!;
  await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ chat_id: chatId, text, parse_mode: 'Markdown' }),
  });
}

async function notify(job: VideoJob, text: string) {
  if (job.chat_id) await sendTelegramMessage(job.chat_id, text);
}

/** Reflects this job's outcome back onto its marketing_plan post, if it came
 * from a scheduled video post (publishPost) rather than an ad-hoc
 * create_video call -- job.plan_post_id is null in the latter case, where
 * recordDirectPostInPlan/trackDirectPost's ad-hoc bookkeeping is all there
 * is. A failed scheduled post lands back in the same 'failed' state a
 * regular post would, so the dashboard's Retry / Pepe's retry_post can
 * re-trigger it -- which re-enters publishPost's video branch and kicks off
 * a fresh HeyGen generation, exactly as intended for a retry. */
async function syncPlanPost(
  job: VideoJob,
  outcome: { status: 'posted'; url?: string; postId: string } | { status: 'failed' }
): Promise<void> {
  if (!job.plan_post_id) return;
  if (outcome.status === 'posted') {
    await markPostStatus(job.plan_post_id, 'posted', outcome.url, outcome.postId);
  } else {
    await markPostStatus(job.plan_post_id, 'failed');
  }
}

async function processGenerating(job: VideoJob): Promise<void> {
  const heygenStatus = await getVideoStatus(job.heygen_video_id);
  if (heygenStatus.status === 'failed') {
    const error = heygenStatus.error ?? 'HeyGen video generation failed.';
    await updateVideoJob(job.id, { status: 'failed', error });
    await syncPlanPost(job, { status: 'failed' });
    await notify(job, `❌ Video generation failed: ${error}`);
    return;
  }
  if (heygenStatus.status !== 'completed' || !heygenStatus.videoUrl) return; // still rendering — checked again next tick

  const uploaded = await uploadVideoFromUrl(heygenStatus.videoUrl);
  if ('error' in uploaded) {
    await updateVideoJob(job.id, { status: 'failed', error: uploaded.error });
    await syncPlanPost(job, { status: 'failed' });
    await notify(job, `❌ Video upload to Cloudinary failed: ${uploaded.error}`);
    return;
  }
  await updateVideoJob(job.id, { cloudinary_url: uploaded.url });

  if (job.platform === 'facebook') {
    const result = await postVideoToFacebook(job.caption, uploaded.url);
    if (result.success && result.postId) {
      await trackDirectPost('facebook', result.postId);
      if (job.plan_post_id) {
        await syncPlanPost(job, { status: 'posted', url: result.url, postId: result.postId });
      } else {
        await recordDirectPostInPlan({
          platform: 'facebook',
          content: job.caption,
          postUrl: result.url,
          platformPostId: result.postId,
          imageNote: 'AI avatar video (HeyGen)',
          postType: 'video',
        });
      }
    } else {
      await syncPlanPost(job, { status: 'failed' });
    }
    await updateVideoJob(job.id, {
      status: result.success ? 'posted' : 'failed',
      error: result.success ? null : (result.error ?? 'Unknown error'),
      post_url: result.url ?? null,
    });
    await notify(
      job,
      result.success ? `✅ Video posted to Facebook! ${result.url ?? ''}` : `❌ Video post to Facebook failed: ${result.error}`
    );
    return;
  }

  const container = await createInstagramVideoContainer(job.caption, uploaded.url);
  if ('error' in container) {
    await updateVideoJob(job.id, { status: 'failed', error: container.error });
    await syncPlanPost(job, { status: 'failed' });
    await notify(job, `❌ Instagram video container failed: ${container.error}`);
    return;
  }
  await updateVideoJob(job.id, { status: 'processing_ig', ig_container_id: container.containerId });
}

async function processInstagramContainer(job: VideoJob): Promise<void> {
  if (!job.ig_container_id) return;
  const check = await checkInstagramContainer(job.ig_container_id);
  if (check.status === 'IN_PROGRESS') return; // checked again next tick
  if (check.status === 'ERROR') {
    const error = check.error ?? 'Instagram failed to process the video.';
    await updateVideoJob(job.id, { status: 'failed', error });
    await syncPlanPost(job, { status: 'failed' });
    await notify(job, `❌ Instagram video processing failed: ${error}`);
    return;
  }

  const published = await publishInstagramContainer(job.ig_container_id);
  if (published.success && published.postId) {
    await trackDirectPost('instagram', published.postId);
    if (job.plan_post_id) {
      await syncPlanPost(job, { status: 'posted', url: published.url, postId: published.postId });
    } else {
      await recordDirectPostInPlan({
        platform: 'instagram',
        content: job.caption,
        postUrl: published.url,
        platformPostId: published.postId,
        imageNote: 'AI avatar video (HeyGen)',
        postType: 'video',
      });
    }
  } else {
    await syncPlanPost(job, { status: 'failed' });
  }
  await updateVideoJob(job.id, {
    status: published.success ? 'posted' : 'failed',
    error: published.success ? null : (published.error ?? 'Unknown error'),
    post_url: published.url ?? null,
  });
  await notify(
    job,
    published.success ? `✅ Video posted to Instagram! ${published.url ?? ''}` : `❌ Instagram video publish failed: ${published.error}`
  );
}

export async function processVideoJobs(): Promise<{ processed: number }> {
  const jobs = await getPendingVideoJobs();
  for (const job of jobs) {
    try {
      if (job.status === 'generating') await processGenerating(job);
      else if (job.status === 'processing_ig') await processInstagramContainer(job);
    } catch (err) {
      await updateVideoJob(job.id, { status: 'failed', error: err instanceof Error ? err.message : String(err) });
      await syncPlanPost(job, { status: 'failed' });
      await notify(job, `❌ Video job failed unexpectedly: ${err instanceof Error ? err.message : String(err)}`);
    }
  }
  return { processed: jobs.length };
}
