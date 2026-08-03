import { NextRequest, NextResponse } from 'next/server';
import { TelegramClient } from '@/lib/telegram';
import { postToLinkedIn } from '@/lib/linkedin-poster';
import { enqueueLinkedInPost } from '@/lib/linkedin-queue';
import { uploadImageBuffer } from '@/lib/cloudinary';
import { recordUpload, getPendingUpload, nameUpload } from '@/lib/cloudinary-uploads';
import { clearHistory, chat } from '@/lib/marketing-agent';
import { trackDirectPost } from '@/lib/marketing-plan';
import { claimTelegramUpdate } from '@/lib/telegram-dedup';
import { resolveAddressee, allBots } from '@/lib/bot-addressing';

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

// Matches "upload", "upload to Restaurants", "upload Restaurants" (case-insensitive).
// Capture group is the folder name, empty when none was given (→ General).
const UPLOAD_CAPTION = /^upload\b\s*(?:to\s+)?(.*)$/i;

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

    // Telegram retries a webhook delivery if it doesn't get a fast response —
    // a slow turn (e.g. a hung tool call) can take long enough that the same
    // update arrives twice, running two concurrent invocations that race on
    // the same chat_history rows for a chat and corrupt the tool_use/
    // tool_result pairing Claude's API requires. A duplicate update_id is a
    // no-op instead of a second full run.
    const updateId: number | undefined = body?.update_id;
    if (updateId !== undefined && !(await claimTelegramUpdate(updateId, 'pepe'))) {
      return NextResponse.json({ ok: true });
    }

    const message = body?.message;
    chatId = message?.chat?.id;
    if (!chatId) return NextResponse.json({ ok: true });

    // Santi and Angeles share this group chat and only respond when
    // explicitly addressed — Pepe is the default for anything not clearly
    // meant for one of them.
    const addressee = resolveAddressee(message, allBots());
    if (addressee !== null && addressee !== 'pepe') {
      return NextResponse.json({ ok: true });
    }

    const text: string | undefined = message?.text?.trim();
    const caption: string | undefined = message?.caption?.trim();
    const photo = message?.photo;
    const video = message?.video;
    const hasMedia = photo || video;

    // A non-command text reply while an upload is still waiting on a name
    // (see the "upload" branch below) is that name, not an ordinary chat
    // message — intercepted here, before /start, /reset, or the agent loop
    // ever see it. Slash commands are exempt (the `!text.startsWith('/')`
    // guard) so they still work normally even with a naming prompt pending;
    // getPendingUpload's own 10-minute window handles a reply that never
    // comes.
    if (text && !text.startsWith('/')) {
      const pending = await getPendingUpload(chatId).catch(() => null);
      if (pending) {
        await nameUpload(pending.id, text);
        await telegram.sendMessage(chatId, `✅ Got it — saved as "${text}". Ask me anytime to use it in a post.`);
        return NextResponse.json({ ok: true });
      }
    }

    if (text === '/start' || text === '/help') {
      await telegram.sendMessage(chatId,
        `👋 MARKETING AGENT\n\nJust talk to me about your marketing strategy — I'll help you plan content, campaigns, and messaging.\n\nCommands:\n/post linkedin <message> — post text to LinkedIn\nsend photo + caption "/post linkedin" — image post\nsend photo + caption "upload" (or "upload to <folder>") — save to the Cloudinary gallery (General folder by default) — I'll ask what to name it so you can use it in a post later\n/reset — clear conversation\n/help — show this menu`
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
      if (result.success && result.postId) await trackDirectPost('linkedin', result.postId);
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
      if (result.success && result.postId) await trackDirectPost('linkedin', result.postId);
      await telegram.sendMessage(chatId, result.success
        ? (result.url ? `✅ Posted!\n\n${result.url}` : '✅ Posted to LinkedIn!')
        : `❌ Failed: ${result.error}`
      );
      return NextResponse.json({ ok: true });
    }

    if (hasMedia && caption && UPLOAD_CAPTION.test(caption)) {
      if (!photo) {
        await telegram.sendMessage(chatId, '❌ Only images can be uploaded to Cloudinary this way — videos aren\'t supported.');
        return NextResponse.json({ ok: true });
      }
      const folderInput = caption.match(UPLOAD_CAPTION)![1].trim();
      const fileId = photo[photo.length - 1].file_id;

      await telegram.sendMessage(chatId, `⏳ Uploading to ${folderInput || 'General'}...`);
      const mediaFile = await downloadTelegramFile(fileId);
      if (!mediaFile) {
        await telegram.sendMessage(chatId, '❌ Failed to download image from Telegram.');
        return NextResponse.json({ ok: true });
      }
      const result = await uploadImageBuffer(mediaFile.data, mediaFile.mimeType, folderInput || undefined);
      if ('error' in result) {
        await telegram.sendMessage(chatId, `❌ Upload failed: ${result.error}`);
      } else {
        // Recorded unnamed for now — the very next plain-text reply from
        // this chat is picked up as its name by the intercept above, so the
        // user can later ask Pepe to build a post with it by that name
        // instead of a raw Cloudinary URL.
        await recordUpload({ chatId, folder: result.folder, publicId: result.id, url: result.url });
        await telegram.sendMessage(chatId, `✅ Uploaded to ${result.folder}!\n\nWhat would you like to name this image? (So you can ask me to use it in a post later.)`);
      }
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
