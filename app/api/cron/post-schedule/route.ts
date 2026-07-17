import { NextResponse } from 'next/server';
import { getPostsDueNow, markPostStatus, getMostRecentPepeChatId } from '@/lib/marketing-plan';
import { postToLinkedIn } from '@/lib/linkedin-poster';
import { postToFacebook, postToInstagram } from '@/lib/meta-poster';
import { listCloudinaryImages } from '@/lib/cloudinary';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

async function sendTelegramMessage(chatId: number, text: string) {
  const token = process.env.TELEGRAM_BOT_TOKEN!;
  await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ chat_id: chatId, text, parse_mode: 'Markdown' }),
  });
}

export async function GET(req: Request) {
  if (
    process.env.CRON_SECRET &&
    req.headers.get('authorization') !== `Bearer ${process.env.CRON_SECRET}`
  ) {
    return new NextResponse('Unauthorized', { status: 401 });
  }

  const posts = await getPostsDueNow();
  if (posts.length === 0) return NextResponse.json({ posted: 0 });

  let defaultImageUrl = '';
  try {
    const images = await listCloudinaryImages();
    if (images.length > 0) defaultImageUrl = images[0].url;
  } catch {}

  const results: string[] = [];

  for (const post of posts) {
    try {
      let result: { success: boolean; postId?: string; url?: string; error?: string } | undefined;
      const imageUrl = defaultImageUrl || undefined;

      if (post.platform === 'linkedin') {
        result = await postToLinkedIn(post.content, imageUrl);
      } else if (post.platform === 'facebook') {
        result = await postToFacebook(post.content, imageUrl);
      } else if (post.platform === 'instagram') {
        if (!imageUrl) {
          await markPostStatus(post.id!, 'failed');
          results.push(`❌ Instagram: no image available`);
          continue;
        }
        result = await postToInstagram(post.content, imageUrl);
      }

      if (result?.success) {
        await markPostStatus(post.id!, 'posted', result.url, result.postId);
        results.push(`✅ ${post.platform}`);
      } else {
        await markPostStatus(post.id!, 'failed');
        results.push(`❌ ${post.platform}: ${result?.error}`);
      }
    } catch (err) {
      await markPostStatus(post.id!, 'failed');
      results.push(`❌ ${post.platform}: ${err instanceof Error ? err.message : String(err)}`);
    }
  }

  const chatId = await getMostRecentPepeChatId();
  if (chatId) {
    await sendTelegramMessage(
      chatId,
      `📢 *Publicaciones automáticas:*\n\n${results.join('\n')}`
    );
  }

  return NextResponse.json({ posted: results.length, results });
}
