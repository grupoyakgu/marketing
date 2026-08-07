import { NextResponse } from 'next/server';
import { getPostsDueNow, getMostRecentPepeChatId } from '@/lib/marketing-plan';
import { publishPost } from '@/lib/publish-post';

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

  const lines: string[] = [];

  for (const post of posts) {
    const result = await publishPost(post.id!);
    if (result.success) {
      const urlLine = result.url ? `\n${result.url}` : '';
      lines.push(`✅ ${post.platform}${urlLine}`);
    } else {
      lines.push(`❌ ${post.platform}: ${result.error}`);
    }
  }

  const chatId = await getMostRecentPepeChatId();
  if (chatId) {
    await sendTelegramMessage(
      chatId,
      `📢 *Publicaciones automáticas:*\n\n${lines.join('\n\n')}`
    );
  }

  return NextResponse.json({ posted: lines.length, results: lines });
}
