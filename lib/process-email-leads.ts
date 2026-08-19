import { supabase } from './supabase';
import { listMessageIds, getMessagePlainText, sendEmail } from './gmail';
import { extractPersuadisLead } from './leads-agent';
import { buildWelcomeEmail } from './lead-reply';
import { TelegramClient } from './telegram';
import { getMostRecentPepeChatId } from './marketing-plan';

const PERSUADIS_SENDER = 'leads@persuadis.com';

interface EmailLeadRow {
  id: string;
  name: string | null;
  apellidos: string | null;
  phone: string | null;
  email: string | null;
  mensaje: string | null;
  utm_campaign: string | null;
}

/** Drains new leads@persuadis.com contact-form emails: for each one not
 * already in email_leads (deduped by Gmail message id), extracts the lead
 * fields, notifies Pepe's group chat, and sends the lead a warm auto-reply.
 * No-ops entirely (returns zeros) until GMAIL_* env vars are configured --
 * listMessageIds returns [] when Gmail isn't set up, same as every other
 * "not configured yet" path in this codebase. */
export async function processEmailLeads(): Promise<{ checked: number; processed: number }> {
  const ids = await listMessageIds(`from:${PERSUADIS_SENDER} newer_than:7d`, 20);
  if (ids.length === 0) return { checked: 0, processed: 0 };

  const { data: existing } = await supabase.from('email_leads').select('gmail_message_id').in('gmail_message_id', ids);
  const known = new Set((existing ?? []).map(r => r.gmail_message_id as string));
  const newIds = ids.filter(id => !known.has(id));

  let processed = 0;
  for (const id of newIds) {
    const bodyText = await getMessagePlainText(id);
    if (!bodyText) continue;

    const lead = await extractPersuadisLead(bodyText);
    if (!lead) continue;

    const { data: row, error } = await supabase
      .from('email_leads')
      .insert({
        gmail_message_id: id,
        name: lead.name,
        apellidos: lead.apellidos,
        phone: lead.phone,
        email: lead.email,
        mensaje: lead.mensaje,
        utm_campaign: lead.utm_campaign,
      })
      .select()
      .single();
    // A unique violation here means a concurrent run already claimed this
    // message id -- either way, skip rather than double-notify/double-reply.
    if (error || !row) {
      if (error && error.code !== '23505') console.error(`[process-email-leads] insert failed for ${id}:`, error.message);
      continue;
    }

    await notifyLead(row);
    await replyToLead(row);
    processed++;
  }

  return { checked: ids.length, processed };
}

async function notifyLead(row: EmailLeadRow): Promise<void> {
  try {
    const chatId = await getMostRecentPepeChatId();
    if (!chatId) return;
    const fullName = [row.name, row.apellidos].filter(Boolean).join(' ') || '—';
    const lines = [
      '📩 Nuevo lead de Persuadis',
      '',
      `Nombre y Apellidos: ${fullName}`,
      `Teléfono: ${row.phone ?? '—'}`,
      `Email: ${row.email ?? '—'}`,
      `Mensaje: ${row.mensaje ?? '—'}`,
      `UTM_Campaing: ${row.utm_campaign ?? '—'}`,
    ];
    await new TelegramClient().sendMessage(chatId, lines.join('\n'));
    await supabase.from('email_leads').update({ notified_at: new Date().toISOString() }).eq('id', row.id);
  } catch (err) {
    console.error('[process-email-leads] notify failed:', err);
  }
}

async function replyToLead(row: EmailLeadRow): Promise<void> {
  if (!row.email) return;
  try {
    const fullName = [row.name, row.apellidos].filter(Boolean).join(' ') || row.name || '';
    const { subject, text } = buildWelcomeEmail({ name: fullName, mensaje: row.mensaje });
    const result = await sendEmail(row.email, subject, text);
    if (result.success) {
      await supabase.from('email_leads').update({ replied_at: new Date().toISOString() }).eq('id', row.id);
    } else {
      await supabase.from('email_leads').update({ reply_error: result.error ?? 'unknown error' }).eq('id', row.id);
    }
  } catch (err) {
    console.error('[process-email-leads] reply failed:', err);
  }
}
