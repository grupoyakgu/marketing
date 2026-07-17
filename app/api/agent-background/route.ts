import { NextRequest, NextResponse } from 'next/server';
import { chat } from '@/lib/marketing-agent';
import { TelegramClient } from '@/lib/telegram';

export const maxDuration = 300;
export const dynamic = 'force-dynamic';

export async function POST(req: NextRequest) {
  const body = await req.json();

  // Simple internal secret check via body
  const secret = body.secret ?? '';
  if ((process.env.INTERNAL_SECRET ?? '') && secret !== (process.env.INTERNAL_SECRET ?? '')) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const { chatId, text } = body;
  const telegram = new TelegramClient();

  try {
    const reply = await chat(chatId, text);
    const chunks = splitMessage(reply, 4000);
    for (const chunk of chunks) {
      await telegram.sendMessage(chatId, chunk);
    }
  } catch (err) {
    console.error('[agent-background] error:', err);
    await telegram.sendMessage(chatId, '❌ Something went wrong while processing your request. Please try again.');
  }

  return NextResponse.json({ ok: true });
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
