import { NextRequest, NextResponse } from 'next/server';
import { TelegramClient } from '@/lib/telegram';
import { chat, clearHistory } from '@/lib/abu-agent';

export const maxDuration = 60;

export async function POST(req: NextRequest) {
  let chatId: number | undefined;
  const telegram = new TelegramClient(process.env.TELEGRAM_ABU_BOT_TOKEN);

  try {
    const body = await req.json();
    const message = body?.message;
    chatId = message?.chat?.id;
    if (!chatId) return NextResponse.json({ ok: true });

    const text: string | undefined = message?.text?.trim();

    if (text === '/start' || text === '/help') {
      await telegram.sendMessage(chatId,
        `👋 Hola, soy Abu.\n\nCEO con más de 20 años desarrollando proyectos de Apartamentos Turísticos (AT) en Sevilla. Te ayudo con estrategia, deals, ubicaciones, financiación y marketing.\n\nComandos:\n/post linkedin <mensaje> — publicar en LinkedIn\n/reset — reiniciar conversación\n/help — mostrar este menú`
      );
      return NextResponse.json({ ok: true });
    }

    if (text === '/reset') {
      clearHistory(chatId);
      await telegram.sendMessage(chatId, '🔄 Conversación reiniciada. ¿En qué te puedo ayudar?');
      return NextResponse.json({ ok: true });
    }

    if (text?.startsWith('/post linkedin ')) {
      const content = text.slice('/post linkedin '.length).trim();
      if (!content) {
        await telegram.sendMessage(chatId, '❌ Uso: /post linkedin <tu mensaje>');
        return NextResponse.json({ ok: true });
      }
      await telegram.sendMessage(chatId, '⏳ Publicando en LinkedIn...');
      const { postToLinkedIn } = await import('@/lib/linkedin-poster');
      const result = await postToLinkedIn(content);
      await telegram.sendMessage(chatId, result.success
        ? (result.url ? `✅ Publicado!\n\n${result.url}` : '✅ Publicado en LinkedIn!')
        : `❌ Error: ${result.error}`
      );
      return NextResponse.json({ ok: true });
    }

    if (text) {
      const reply = await chat(chatId, text);
      await telegram.sendMessage(chatId, reply);
      return NextResponse.json({ ok: true });
    }

  } catch (err: unknown) {
    console.error('[telegram-abu] error:', err);
    if (chatId) {
      try {
        await new TelegramClient(process.env.TELEGRAM_ABU_BOT_TOKEN).sendMessage(chatId, '❌ Algo salió mal. Por favor inténtalo de nuevo.');
      } catch { /* ignore */ }
    }
  }

  return NextResponse.json({ ok: true });
}
