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

  const results: string[] = [];

  for (const post of posts) {
    const result = await publishPost(post.id!);
    results.push(result.success ? `✅ ${post.platform}` : `❌ ${post.platform}: ${result.error}`);
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
