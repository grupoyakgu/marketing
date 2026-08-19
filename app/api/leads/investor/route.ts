import { NextRequest, NextResponse } from 'next/server';
import { recordInvestorLead, notifyNewInvestorLead, sendInvestorWelcomeEmail } from '@/lib/investor-leads';

const VALID_LOCALES = ['es', 'en', 'he'];
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function safeUtm(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const trimmed = value.trim().slice(0, 100);
  return trimmed || null;
}

export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => null);
  if (!body) return NextResponse.json({ error: 'Invalid request body' }, { status: 400 });

  // Honeypot — a real visitor never sees or fills this field (hidden via CSS
  // on the form), so a filled value means a bot. Return a normal-looking
  // success instead of a 4xx so the bot doesn't learn to avoid this tell.
  if (typeof body.company === 'string' && body.company.trim() !== '') {
    return NextResponse.json({ ok: true });
  }

  const name = typeof body.name === 'string' ? body.name.trim() : '';
  const email = typeof body.email === 'string' ? body.email.trim() : '';
  const mobile = typeof body.mobile === 'string' ? body.mobile.trim() : '';
  const locale = typeof body.locale === 'string' ? body.locale : '';

  if (!name || !email || !mobile) {
    return NextResponse.json({ error: 'Name, email, and mobile are required' }, { status: 400 });
  }
  if (!EMAIL_RE.test(email)) {
    return NextResponse.json({ error: 'Invalid email address' }, { status: 400 });
  }
  if (!VALID_LOCALES.includes(locale)) {
    return NextResponse.json({ error: 'Invalid locale' }, { status: 400 });
  }

  const utm_source = safeUtm(body.utm_source);
  const utm_medium = safeUtm(body.utm_medium);
  const utm_campaign = safeUtm(body.utm_campaign);

  try {
    const lead = await recordInvestorLead({ name, email, mobile, locale, utm_source, utm_medium, utm_campaign });
    await notifyNewInvestorLead(lead);
    await sendInvestorWelcomeEmail(lead);
    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error('[api/leads/investor] failed:', err);
    return NextResponse.json({ error: 'Something went wrong. Please try again.' }, { status: 500 });
  }
}
