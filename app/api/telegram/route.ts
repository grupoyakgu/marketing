import { NextRequest, NextResponse } from 'next/server';
import { TelegramClient } from '@/lib/telegram';
import { postToLinkedIn } from '@/lib/linkedin-poster';
import { enqueueLinkedInPost } from '@/lib/linkedin-queue';
import { clearHistory, chat } from '@/lib/marketing-agent';

export const maxDuration = 300;

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

function splitMessage(text: string, maxLen: number): string[] {
  if (text.length <= maxLen) return [text];
  const chunks: string[] = [];
  let i = 0;
  while (i < text.length) {
    chunks.push(text.slice(i, i + maxLen));
    i += maxLen;
  }
  return chunks;
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

    if (text === '/start' || text === '/help') {
      await telegram.sendMessage(chatId,
        `👋 MARKETING AGENT\n\nJust talk to me about your marketing strategy — I'll help you plan content, campaigns, and messaging.\n\nCommands:\n/post linkedin <message> — post text to LinkedIn\n/reset — clear conversation\n/help — show this menu`
      );
      return NextResponse.json({ ok: true });
    }

    if (text === '/reset') {
      clearHistory(chatId);
      await telegram.sendMessage(chatId, '🔄 Conversation reset. What would you like to work on?');
      return NextResponse.json({ ok: true });
    }

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
        const baseUrl = process.env.NEXT_PUBLIC_APP_URL ?? 'https://marketing-grupo-yakgu.vercel.app';
        const jobId = await enqueueLinkedInPost(chatId, content, fileId, 'VIDEO');
        fetch(`${baseUrl}/api/linkedin/process`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
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

    // Free-text → run agent directly (maxDuration=300 gives us 5 minutes)
    if (text) {
      const resolvedChatId = chatId;
      try {
        const reply = await chat(resolvedChatId, text);
        const chunks = splitMessage(reply, 4000);
        for (const chunk of chunks) {
          await telegram.sendMessage(resolvedChatId, chunk);
        }
      } catch (err) {
        console.error('[telegram] agent error:', err);
        await telegram.sendMessage(resolvedChatId, '❌ Something went wrong. Please try again.');
      }
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
