import Anthropic from '@anthropic-ai/sdk';

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
    model: 'claude-sonnet-4-6',
    max_tokens: 2048,
    system: SYSTEM_PROMPT,
    messages: [{ role: 'user', content: `Source: ${source}\n\n${html.slice(0, 40000)}` }],
  });

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

export function formatLeadsForTelegram(leads: Lead[]): string {
  if (leads.length === 0) return 'No leads found.';
  return leads
    .map((l, i) => `${i + 1}. *${l.name}* — ${l.role} at ${l.company}${l.email ? `\n   📧 ${l.email}` : ''}\n   🔗 ${l.url}`)
    .join('\n\n');
}
