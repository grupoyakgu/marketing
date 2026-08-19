import Anthropic from '@anthropic-ai/sdk';
import { recordUsage } from '@/lib/token-usage';

const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

export interface Lead {
  name: string;
  role: string;
  company: string;
  url: string;
  email?: string;
}

const SYSTEM_PROMPT = `You are a lead extraction assistant. Given raw HTML or text scraped from a website,
extract structured lead information. Return a JSON array of leads with this shape:
[{ "name": string, "role": string, "company": string, "url": string, "email": string | null }]
Only return the JSON array — no explanation.`;

export async function extractLeadsFromHtml(html: string, source: string): Promise<Lead[]> {
  const response = await client.messages.create({
    model: 'claude-haiku-4-5',
    max_tokens: 2048,
    system: SYSTEM_PROMPT,
    messages: [{ role: 'user', content: `Source: ${source}\n\n${html.slice(0, 40000)}` }],
  });
  await recordUsage('leads', response.model, response.usage);

  const block = response.content[0];
  if (block.type !== 'text') return [];

  try {
    const match = block.text.match(/\[[\s\S]*\]/);
    if (!match) return [];
    return JSON.parse(match[0]) as Lead[];
  } catch {
    return [];
  }
}

export interface PersuadisLead {
  name: string;
  apellidos: string;
  phone: string | null;
  email: string | null;
  mensaje: string | null;
  utm_campaign: string | null;
}

const PERSUADIS_SYSTEM_PROMPT = `You extract structured contact-form lead data from a plain-text email body written in Spanish. The email has labeled fields in roughly this shape, though field order and which fields are present can vary:
Nombre: ... Apellidos: ... Teléfono: ... Email: ... Mensaje: ... UTM_Campaing: ... (there may also be extra trailing fields like Publicidad, IP, Aceptación GDPR, Dominio -- ignore those).
Return ONLY a JSON object of this shape, no other text:
{"name": string, "apellidos": string, "phone": string | null, "email": string | null, "mensaje": string | null, "utm_campaign": string | null}
Use null for any field that is missing or empty.`;

/** Persuadis (leads@persuadis.com) sends real-estate contact-form leads as a
 * plain-text email with labeled fields rather than JSON, and the exact set
 * of fields present varies per lead -- Haiku extraction is more robust to
 * that drift than a fixed regex would be, matching the pattern
 * extractLeadsFromHtml above already uses for the same reason. */
export async function extractPersuadisLead(bodyText: string): Promise<PersuadisLead | null> {
  const response = await client.messages.create({
    model: 'claude-haiku-4-5',
    max_tokens: 512,
    system: PERSUADIS_SYSTEM_PROMPT,
    messages: [{ role: 'user', content: bodyText.slice(0, 8000) }],
  });
  await recordUsage('leads', response.model, response.usage);

  const block = response.content[0];
  if (block.type !== 'text') return null;

  try {
    const match = block.text.match(/\{[\s\S]*\}/);
    if (!match) return null;
    return JSON.parse(match[0]) as PersuadisLead;
  } catch {
    return null;
  }
}

export function formatLeadsForTelegram(leads: Lead[]): string {
  if (leads.length === 0) return 'No leads found.';
  return leads
    .map((l, i) => `${i + 1}. *${l.name}* — ${l.role} at ${l.company}${l.email ? `\n   📧 ${l.email}` : ''}\n   🔗 ${l.url}`)
    .join('\n\n');
}
