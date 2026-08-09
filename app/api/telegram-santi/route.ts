import { NextRequest, NextResponse } from 'next/server';
import { TelegramClient } from '@/lib/telegram';
import { clearHistory, chat } from '@/lib/dev-agent';
import { broadcastToTeammates } from '@/lib/chat-history';
import { claimTelegramUpdate } from '@/lib/telegram-dedup';
import { resolveAddressee, allBots } from '@/lib/bot-addressing';

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
  const telegram = new TelegramClient(process.env.SANTI_BOT_TOKEN);

  try {
    const body = await req.json();

    const updateId: number | undefined = body?.update_id;
    if (updateId !== undefined && !(await claimTelegramUpdate(updateId, 'santi'))) {
      return NextResponse.json({ ok: true });
    }

    const message = body?.message;
    chatId = message?.chat?.id;
    if (!chatId) return NextResponse.json({ ok: true });

    // A bot-authored message would never numerically match the owner's
    // Telegram user id anyway (so it'd be silently dropped by the gate
    // below regardless), but this is an explicit backstop: Santi learns
    // what a teammate posts via broadcastToTeammates at the moment they
    // send it, not by processing their message here as if a human sent it.
    if (message.from?.is_bot) return NextResponse.json({ ok: true });

    // Only the owner of this bot can instruct it — it can open PRs and merge
    // them, so anyone else in the group being able to trigger that would be
    // a real problem, not just noise. Silently ignoring (rather than
    // replying "not authorized") avoids confirming to anyone else in the
    // group that a message was even seen.
    const senderId: number | undefined = message?.from?.id;
    const ownerId = process.env.SANTI_OWNER_TELEGRAM_ID;
    if (!ownerId || String(senderId) !== ownerId) {
      return NextResponse.json({ ok: true });
    }

    const text: string | undefined = message?.text?.trim();

    if (text === '/start' || text === '/help') {
      await telegram.sendMessage(chatId,
        `👋 SANTI\n\nCTO here. Tell me about a bug or something you want built/changed in the app and I'll dig into the code.\n\n/reset — clear conversation\n/help — show this menu`
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
    // to Santi specifically.
    if (resolveAddressee(message, allBots()) !== 'santi') {
      return NextResponse.json({ ok: true });
    }

    if (text) {
      const resolvedChatId = chatId;
      try {
        const reply = await chat(resolvedChatId, text);
        const chunks = splitMessage(reply, 4000);
        for (const chunk of chunks) {
          await telegram.sendMessage(resolvedChatId, chunk);
        }
        await broadcastToTeammates(resolvedChatId, 'santi', reply);
      } catch (err) {
        console.error('[telegram-santi] agent error:', err);
        await telegram.sendMessage(resolvedChatId, '❌ Something went wrong. Please try again.');
      }
      return NextResponse.json({ ok: true });
    }

  } catch (err: unknown) {
    console.error('[telegram-santi] error:', err);
    if (chatId) {
      try {
        await telegram.sendMessage(chatId, '❌ Something went wrong. Please try again.');
      } catch { /* ignore */ }
    }
  }

  return NextResponse.json({ ok: true });
}
