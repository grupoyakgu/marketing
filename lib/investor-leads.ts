import { supabase } from './supabase';
import { TelegramClient } from './telegram';
import { getMostRecentPepeChatId } from './marketing-plan';
import { sendEmail } from './gmail';
import { buildWelcomeEmail } from './lead-reply';

export interface InvestorLead {
  id: string;
  name: string;
  email: string;
  mobile: string;
  locale: string;
  created_at: string;
  utm_source: string | null;
  utm_medium: string | null;
  utm_campaign: string | null;
}

export async function recordInvestorLead(fields: {
  name: string;
  email: string;
  mobile: string;
  locale: string;
  utm_source?: string | null;
  utm_medium?: string | null;
  utm_campaign?: string | null;
}): Promise<InvestorLead> {
  const { data, error } = await supabase
    .from('investor_leads')
    .insert({
      name: fields.name,
      email: fields.email,
      mobile: fields.mobile,
      locale: fields.locale,
      utm_source: fields.utm_source ?? null,
      utm_medium: fields.utm_medium ?? null,
      utm_campaign: fields.utm_campaign ?? null,
    })
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
    const source = lead.utm_source ? ` via ${lead.utm_source}` : '';
    await new TelegramClient().sendMessage(
      chatId,
      `🎯 New investor lead (${lead.locale}${source})\n\nName: ${lead.name}\nEmail: ${lead.email}\nMobile: ${lead.mobile}`
    );
  } catch (err) {
    console.error('[investor-leads] notify failed:', err);
  }
}

/** Same warm auto-reply mechanism as the Persuadis email leads -- best
 * effort and never throws, so a Gmail hiccup (or Gmail simply not being
 * configured yet) can't fail the form submission itself. */
export async function sendInvestorWelcomeEmail(lead: InvestorLead): Promise<void> {
  try {
    const { subject, text } = buildWelcomeEmail({ name: lead.name });
    await sendEmail(lead.email, subject, text);
  } catch (err) {
    console.error('[investor-leads] welcome email failed:', err);
  }
}
