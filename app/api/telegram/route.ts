import { NextRequest, NextResponse } from 'next/server';
import { TelegramClient } from '@/lib/telegram';
import { postToLinkedIn } from '@/lib/linkedin-poster';
import { enqueueLinkedInPost } from '@/lib/linkedin-queue';
import { chat, clearHistory } from '@/lib/marketing-agent';

export const maxDuration = 60;

async function downloadTelegramFile(fileId: string): Promise<{ data: ArrayBuffer; mimeType: string; mediaType: 'IMAGE' | 'VIDEO' } | null> {
  const token = process.env.TELEGRAM_BOT_TOKEN;
  if (!token) return null;

  const infoRes = await fetch(`https://api.telegram.org/bot${token}/getFile?file_id=${fileId}`);
  const info = await infoRes.json();
  if (!info.ok) return null;

  const filePath: string = info.result.file_path;
  const fileRes = await fetch(`https://api.telegram.org/file/bot${token}/${filePath}`);
  if (!fileRes.ok) return null;

  const data = await fileRes.arrayBuffer();
  const isVideo = filePath.endsWith('.mp4') || filePath.includes('video');
  return { data, mimeType: isVideo ? 'video/mp4' : 'image/jpeg', mediaType: isVideo ? 'VIDEO' : 'IMAGE' };
}

export async function POST(req: NextRequest) {
  let chatId: number | undefined;
  const telegram = new TelegramClient();

  try {
    const body = await req.json();
    const message = body?.message;
    chatId = message?.chat?.id;
    if (!chatId) return NextResponse.json({ ok: true });

    const text: string | undefined = message?.text?.trim();
    const caption: string | undefined = message?.caption?.trim();
    const photo = message?.photo;
    const video = message?.video;
    const hasMedia = photo || video;

    // /start or /help
    if (text === '/start' || text === '/help') {
      await telegram.sendMessage(chatId,
        `👋 MARKETING AGENT\n\nJust talk to me about your LinkedIn marketing strategy — I'll help you plan content, campaigns, and messaging.\n\nCommands:\n/post linkedin <message> — post text to LinkedIn\n/reset — clear conversation\n/help — show this menu\n\nTo post with media:\nSend a photo or video with caption:\n/post linkedin <your message>`
      );
      return NextResponse.json({ ok: true });
    }

    // /reset
    if (text === '/reset') {
      clearHistory(chatId);
      await telegram.sendMessage(chatId, '🔄 Conversation reset. What would you like to work on?');
      return NextResponse.json({ ok: true });
    }

    // /post linkedin <text>
    if (text?.startsWith('/post linkedin ')) {
      const content = text.slice('/post linkedin '.length).trim();
      if (!content) {
        await telegram.sendMessage(chatId, '❌ Usage: /post linkedin <your message>');
        return NextResponse.json({ ok: true });
      }
      await telegram.sendMessage(chatId, '⏳ Posting to LinkedIn...');
      const result = await postToLinkedIn(content);
      await telegram.sendMessage(chatId, result.success
        ? (result.url ? `✅ Posted!\n\n${result.url}` : '✅ Posted to LinkedIn!')
        : `❌ Failed: ${result.error}`
      );
      return NextResponse.json({ ok: true });
    }

    // Media LinkedIn post
    if (hasMedia && caption?.startsWith('/post linkedin')) {
      const content = caption.replace('/post linkedin', '').trim();
      let fileId: string;
      let mediaType: 'IMAGE' | 'VIDEO';

      if (photo) {
        fileId = photo[photo.length - 1].file_id;
        mediaType = 'IMAGE';
      } else {
        fileId = video.file_id;
        mediaType = 'VIDEO';
      }

      if (mediaType === 'VIDEO') {
        await telegram.sendMessage(chatId, '⏳ Queuing video... I\'ll notify you when it\'s posted.');
        const jobId = await enqueueLinkedInPost(chatId, content, fileId, 'VIDEO');
        const baseUrl = process.env.NEXT_PUBLIC_APP_URL ?? `https://${req.headers.get('host')}`;
        fetch(`${baseUrl}/api/linkedin/process`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'x-internal-secret': process.env.INTERNAL_SECRET ?? '' },
          body: JSON.stringify({ jobId }),
        }).catch(() => {});
        return NextResponse.json({ ok: true });
      }

      await telegram.sendMessage(chatId, '⏳ Uploading image and posting to LinkedIn...');
      const mediaFile = await downloadTelegramFile(fileId);
      if (!mediaFile) {
        await telegram.sendMessage(chatId, '❌ Failed to download image from Telegram.');
        return NextResponse.json({ ok: true });
      }
      const result = await postToLinkedIn(content, mediaFile);
      await telegram.sendMessage(chatId, result.success
        ? (result.url ? `✅ Posted!\n\n${result.url}` : '✅ Posted to LinkedIn!')
        : `❌ Failed: ${result.error}`
      );
      return NextResponse.json({ ok: true });
    }

    // Free-text → conversational marketing agent
    if (text) {
      const reply = await chat(chatId, text);
      await telegram.sendMessage(chatId, reply);
      return NextResponse.json({ ok: true });
    }

  } catch (err: unknown) {
    console.error('[telegram] error:', err);
    if (chatId) {
      try {
        await new TelegramClient().sendMessage(chatId, '❌ Something went wrong. Please try again.');
      } catch { /* ignore */ }
    }
  }

  return NextResponse.json({ ok: true });
}
