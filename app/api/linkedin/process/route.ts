import { NextRequest, NextResponse } from 'next/server';
import { claimJob, markJobDone, markJobError } from '@/lib/linkedin-queue';
import { postToLinkedIn } from '@/lib/linkedin-poster';
import { TelegramClient } from '@/lib/telegram';

export const maxDuration = 300;

async function downloadTelegramFile(fileId: string): Promise<{ buffer: Buffer; mimeType: string; mediaType: 'IMAGE' | 'VIDEO' } | null> {
  const token = process.env.TELEGRAM_BOT_TOKEN;
  if (!token) return null;

  const infoRes = await fetch(`https://api.telegram.org/bot${token}/getFile?file_id=${fileId}`);
  const info = await infoRes.json();
  if (!info.ok) return null;

  const filePath: string = info.result.file_path;
  const fileRes = await fetch(`https://api.telegram.org/file/bot${token}/${filePath}`);
  if (!fileRes.ok) return null;

  const buffer = Buffer.from(await fileRes.arrayBuffer());
  const isVideo = filePath.endsWith('.mp4') || filePath.includes('video');
  return { buffer, mimeType: isVideo ? 'video/mp4' : 'image/jpeg', mediaType: isVideo ? 'VIDEO' : 'IMAGE' };
}

export async function POST(req: NextRequest) {
  const secret = req.headers.get('x-internal-secret');
  if (secret !== process.env.INTERNAL_SECRET) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const { jobId } = await req.json();
  if (!jobId) return NextResponse.json({ error: 'Missing jobId' }, { status: 400 });

  const telegram = new TelegramClient();
  const job = await claimJob(jobId);
  if (!job) return NextResponse.json({ error: 'Job not found or already claimed' }, { status: 404 });

  try {
    let media: { buffer: Buffer; mimeType: string; mediaType: 'IMAGE' | 'VIDEO' } | undefined;
    if (job.file_id && job.media_type) {
      const downloaded = await downloadTelegramFile(job.file_id);
      if (!downloaded) throw new Error('Failed to download media from Telegram');
      media = downloaded;
    }

    const result = await postToLinkedIn(job.text, media);
    if (!result.success) throw new Error(result.error ?? 'Unknown LinkedIn error');

    await markJobDone(job.id);
    await telegram.sendMessage(job.chat_id, result.url ? `✅ Posted to LinkedIn!\n\n${result.url}` : '✅ Posted to LinkedIn!');
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    await markJobError(job.id, message);
    await telegram.sendMessage(job.chat_id, `❌ LinkedIn post failed: ${message}`);
  }

  return NextResponse.json({ ok: true });
}
