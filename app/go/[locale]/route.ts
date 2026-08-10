import { NextRequest, NextResponse } from 'next/server';
import { supabase } from '@/lib/supabase';
import { LOCALES, DEFAULT_LOCALE, type Locale } from '@/app/invest/[locale]/copy';

// Tracked entry point for outbound links (e.g. a LinkedIn/Instagram post
// pointing at /go/en?utm_source=linkedin&utm_medium=social&utm_campaign=...).
// Logs the click, then forwards straight into the investor landing page with
// the same UTM params attached, so the page_events pageview and any eventual
// lead submission share the same attribution as this click.
export const dynamic = 'force-dynamic';

function isLocale(value: string): value is Locale {
  return (LOCALES as string[]).includes(value);
}

export async function GET(req: NextRequest, { params }: { params: { locale: string } }) {
  const locale = isLocale(params.locale) ? params.locale : DEFAULT_LOCALE;
  const { searchParams } = req.nextUrl;

  const utm_source = searchParams.get('utm_source')?.slice(0, 100) || null;
  const utm_medium = searchParams.get('utm_medium')?.slice(0, 100) || null;
  const utm_campaign = searchParams.get('utm_campaign')?.slice(0, 100) || null;

  try {
    const { error } = await supabase
      .from('link_clicks')
      .insert({ landing_page: 'bds36', locale, utm_source, utm_medium, utm_campaign });
    if (error) console.error('[go] insert failed:', error.message);
  } catch (err) {
    // Best-effort — a tracking failure must never block the redirect.
    console.error('[go] unexpected error:', err);
  }

  const dest = new URL(`/invest/${locale}`, req.nextUrl.origin);
  if (utm_source) dest.searchParams.set('utm_source', utm_source);
  if (utm_medium) dest.searchParams.set('utm_medium', utm_medium);
  if (utm_campaign) dest.searchParams.set('utm_campaign', utm_campaign);

  return NextResponse.redirect(dest, { status: 302 });
}
