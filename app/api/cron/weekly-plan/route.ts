import { NextResponse } from 'next/server';
import { chat } from '@/lib/marketing-agent';
import { getMostRecentPepeChatId, getNextMonday } from '@/lib/marketing-plan';

export const dynamic = 'force-dynamic';
export const maxDuration = 120;

export async function GET(req: Request) {
  if (
    process.env.CRON_SECRET &&
    req.headers.get('authorization') !== `Bearer ${process.env.CRON_SECRET}`
  ) {
    return new NextResponse('Unauthorized', { status: 401 });
  }

  const chatId = await getMostRecentPepeChatId();
  if (!chatId) return NextResponse.json({ error: 'No active Pepe chat found' }, { status: 404 });

  const nextMonday = getNextMonday();
  const reply = await chat(
    chatId,
    `Generate the weekly marketing plan for the week starting ${nextMonday}. Draft all 10 posts following our standard schedule and save them. Then present the full plan for my review.`
  );

  const token = process.env.TELEGRAM_BOT_TOKEN!;
  await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      chat_id: chatId,
      text: reply,
      parse_mode: 'Markdown',
    }),
  });

  return NextResponse.json({ ok: true, week_start: nextMonday });
}
