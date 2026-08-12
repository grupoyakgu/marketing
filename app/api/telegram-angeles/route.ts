import { NextRequest, NextResponse } from 'next/server';
import { TelegramClient } from '@/lib/telegram';
import { clearHistory, chat } from '@/lib/product-agent';
import { broadcastToTeammates } from '@/lib/chat-history';
import { claimTelegramUpdate } from '@/lib/telegram-dedup';
import { resolveAddressee, allBots } from '@/lib/bot-addressing';
import { ChatBusyError } from '@/lib/chat-lock';

export const maxDuration = 300;

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
  const telegram = new TelegramClient(process.env.ANGELES_BOT_TOKEN);

  try {
    const body = await req.json();

    const updateId: number | undefined = body?.update_id;
    if (updateId !== undefined && !(await claimTelegramUpdate(updateId, 'angeles'))) {
      return NextResponse.json({ ok: true });
    }

    const message = body?.message;
    chatId = message?.chat?.id;
    if (!chatId) return NextResponse.json({ ok: true });

    // Angeles learns what a teammate posts via broadcastToTeammates at the
    // moment they send it, not by processing their message here as if a
    // human sent it.
    if (message.from?.is_bot) return NextResponse.json({ ok: true });

    // Unlike Santi, Angeles has no write/posting ability at all — she only
    // advises — so any group member can address her, not just one owner.
    const text: string | undefined = message?.text?.trim();

    if (text === '/start' || text === '/help') {
      await telegram.sendMessage(chatId,
        `👋 ANGELES\n\nCPO here. Tell me about a feature, flow, or problem and I'll help you think it through — PRDs, user stories, UX, roadmaps, prioritization, whatever's useful.\n\n/reset — clear conversation\n/help — show this menu`
      );
      return NextResponse.json({ ok: true });
    }

    if (text === '/reset') {
      await clearHistory(chatId);
      await telegram.sendMessage(chatId, '🔄 Conversation reset.');
      return NextResponse.json({ ok: true });
    }

    // Pepe, Santi, and Angeles share this group chat, so every message
    // reaches all three — only actually respond when this one is addressed
    // to Angeles specifically.
    if (resolveAddressee(message, allBots()) !== 'angeles') {
      return NextResponse.json({ ok: true });
    }

    if (text) {
      const resolvedChatId = chatId;
      const senderId: number | undefined = message?.from?.id;
      try {
        const reply = await chat(resolvedChatId, text, senderId);
        const chunks = splitMessage(reply, 4000);
        for (const chunk of chunks) {
          await telegram.sendMessage(resolvedChatId, chunk);
        }
        await broadcastToTeammates(resolvedChatId, 'angeles', reply);
      } catch (err) {
        console.error('[telegram-angeles] agent error:', err);
        await telegram.sendMessage(
          resolvedChatId,
          err instanceof ChatBusyError
            ? "⏳ I'm still finishing something else in this chat — give me a moment and try again."
            : '❌ Something went wrong. Please try again.'
        );
      }
      return NextResponse.json({ ok: true });
    }

  } catch (err: unknown) {
    console.error('[telegram-angeles] error:', err);
    if (chatId) {
      try {
        await telegram.sendMessage(chatId, '❌ Something went wrong. Please try again.');
      } catch { /* ignore */ }
    }
  }

  return NextResponse.json({ ok: true });
}
