import { getPendingVideoJobs, updateVideoJob, type VideoJob } from './video-jobs';
import { getVideoStatus } from './heygen';
import { uploadVideoFromUrl } from './cloudinary';
import {
  postVideoToFacebook,
  createInstagramVideoContainer,
  checkInstagramContainer,
  publishInstagramContainer,
} from './meta-poster';
import { trackDirectPost, recordDirectPostInPlan } from './marketing-plan';

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

async function processGenerating(job: VideoJob): Promise<void> {
  const heygenStatus = await getVideoStatus(job.heygen_video_id);
  if (heygenStatus.status === 'failed') {
    const error = heygenStatus.error ?? 'HeyGen video generation failed.';
    await updateVideoJob(job.id, { status: 'failed', error });
    await notify(job, `❌ Video generation failed: ${error}`);
    return;
  }
  if (heygenStatus.status !== 'completed' || !heygenStatus.videoUrl) return; // still rendering — checked again next tick

  const uploaded = await uploadVideoFromUrl(heygenStatus.videoUrl);
  if ('error' in uploaded) {
    await updateVideoJob(job.id, { status: 'failed', error: uploaded.error });
    await notify(job, `❌ Video upload to Cloudinary failed: ${uploaded.error}`);
    return;
  }
  await updateVideoJob(job.id, { cloudinary_url: uploaded.url });

  if (job.platform === 'facebook') {
    const result = await postVideoToFacebook(job.caption, uploaded.url);
    if (result.success && result.postId) {
      await trackDirectPost('facebook', result.postId);
      await recordDirectPostInPlan({
        platform: 'facebook',
        content: job.caption,
        postUrl: result.url,
        platformPostId: result.postId,
        imageNote: 'AI avatar video (HeyGen)',
      });
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
    await notify(job, `❌ Instagram video processing failed: ${error}`);
    return;
  }

  const published = await publishInstagramContainer(job.ig_container_id);
  if (published.success && published.postId) {
    await trackDirectPost('instagram', published.postId);
    await recordDirectPostInPlan({
      platform: 'instagram',
      content: job.caption,
      postUrl: published.url,
      platformPostId: published.postId,
      imageNote: 'AI avatar video (HeyGen)',
    });
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
      await notify(job, `❌ Video job failed unexpectedly: ${err instanceof Error ? err.message : String(err)}`);
    }
  }
  return { processed: jobs.length };
}
