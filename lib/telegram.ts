export class TelegramClient {
  private token: string;

  constructor(token?: string) {
    this.token = token ?? process.env.TELEGRAM_BOT_TOKEN!;
  }

  async sendMessage(chatId: number, text: string): Promise<void> {
    await fetch(`https://api.telegram.org/bot${this.token}/sendMessage`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ chat_id: chatId, text }),
    });
  }
}
