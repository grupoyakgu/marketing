import { NextRequest, NextResponse } from 'next/server';
import { supabase } from '@/lib/supabase';

export async function POST(req: NextRequest) {
  try {
    const body = await req.json().catch(() => null);
    if (!body) return NextResponse.json({ ok: true });

    const landing_page = typeof body.landing_page === 'string' ? body.landing_page.trim() : '';
    const locale = typeof body.locale === 'string' ? body.locale.trim() : '';
    if (!landing_page || !locale) return NextResponse.json({ ok: true });

    const utm_source = typeof body.utm_source === 'string' ? body.utm_source.slice(0, 100) : null;
    const utm_medium = typeof body.utm_medium === 'string' ? body.utm_medium.slice(0, 100) : null;
    const utm_campaign = typeof body.utm_campaign === 'string' ? body.utm_campaign.slice(0, 100) : null;

    const { error } = await supabase
      .from('page_events')
      .insert({ landing_page, locale, utm_source, utm_medium, utm_campaign });

    if (error) console.error('[api/events/pageview] insert failed:', error.message);
  } catch (err) {
    console.error('[api/events/pageview] unexpected error:', err);
  }

  // Always 200 — never expose errors to the client
  return NextResponse.json({ ok: true });
}
