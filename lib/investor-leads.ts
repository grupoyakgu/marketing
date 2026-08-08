import { supabase } from './supabase';
import { TelegramClient } from './telegram';
import { getMostRecentPepeChatId } from './marketing-plan';

export interface InvestorLead {
  id: string;
  name: string;
  email: string;
  mobile: string;
  locale: string;
  created_at: string;
}

export async function recordInvestorLead(fields: {
  name: string;
  email: string;
  mobile: string;
  locale: string;
}): Promise<InvestorLead> {
  const { data, error } = await supabase
    .from('investor_leads')
    .insert({ name: fields.name, email: fields.email, mobile: fields.mobile, locale: fields.locale })
    .select()
    .single();
  if (error) throw new Error(error.message);
  return data;
}

/** Best-effort ping to the group chat so a new investor lead doesn't just sit
 * silently in the DB — mirrors how every other "something happened" event in
 * this app surfaces through Telegram. Never throws: a notification failure
 * shouldn't fail the lead submission itself. */
export async function notifyNewInvestorLead(lead: InvestorLead): Promise<void> {
  try {
    const chatId = await getMostRecentPepeChatId();
    if (!chatId) return;
    await new TelegramClient().sendMessage(
      chatId,
      `🎯 New investor lead (${lead.locale})\n\nName: ${lead.name}\nEmail: ${lead.email}\nMobile: ${lead.mobile}`
    );
  } catch (err) {
    console.error('[investor-leads] notify failed:', err);
  }
}
