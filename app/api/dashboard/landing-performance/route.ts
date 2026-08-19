import { NextRequest, NextResponse } from 'next/server';
import { supabase } from '@/lib/supabase';

export const dynamic = 'force-dynamic';

interface PageEvent {
  created_at: string;
  locale: string;
  utm_source: string | null;
}

interface LinkClick {
  created_at: string;
  locale: string;
  utm_source: string | null;
}

interface LeadRow {
  id: string;
  created_at: string;
  name: string;
  email: string;
  mobile: string;
  locale: string;
  utm_source: string | null;
  consent_marketing: boolean;
}

interface EmailLeadRow {
  id: string;
  created_at: string;
  name: string | null;
  apellidos: string | null;
  phone: string | null;
  email: string | null;
  gmail_message_id: string;
}

/** Gmail's web client accepts a message's Gmail API id directly as a
 * permalink fragment -- this opens that exact message in koby@grupoyakgu.es's
 * inbox rather than just a compose window, so a click takes you straight to
 * what the lead actually wrote. */
function gmailMessageUrl(messageId: string): string {
  return `https://mail.google.com/mail/u/0/#all/${messageId}`;
}

function isoDate(d: Date): string {
  return d.toISOString().split('T')[0];
}

export async function GET(req: NextRequest) {
  const { searchParams } = req.nextUrl;
  const since = searchParams.get('since');
  const until = searchParams.get('until');
  if (!since || !until) {
    return NextResponse.json({ error: 'since and until are required' }, { status: 400 });
  }

  const landing_page = searchParams.get('landing_page') ?? 'bds36';
  const utmSourceFilter = searchParams.get('utm_source');

  // Date bounds: since = start of day, until = end of day
  const sinceTs = `${since}T00:00:00.000Z`;
  const untilTs = `${until}T23:59:59.999Z`;

  // Fetch page_events
  let eventsQuery = supabase
    .from('page_events')
    .select('created_at, locale, utm_source')
    .eq('landing_page', landing_page)
    .gte('created_at', sinceTs)
    .lte('created_at', untilTs);
  if (utmSourceFilter) eventsQuery = eventsQuery.eq('utm_source', utmSourceFilter);
  const { data: eventsRaw, error: eventsError } = await eventsQuery;
  if (eventsError) {
    console.error('[api/dashboard/landing-performance] page_events query failed:', eventsError.message);
    return NextResponse.json({ error: 'Failed to load page events' }, { status: 500 });
  }
  const events: PageEvent[] = eventsRaw ?? [];

  // Fetch link_clicks — logged by /go/[locale] before it redirects into the page
  let clicksQuery = supabase
    .from('link_clicks')
    .select('created_at, locale, utm_source')
    .eq('landing_page', landing_page)
    .gte('created_at', sinceTs)
    .lte('created_at', untilTs);
  if (utmSourceFilter) clicksQuery = clicksQuery.eq('utm_source', utmSourceFilter);
  const { data: clicksRaw, error: clicksError } = await clicksQuery;
  if (clicksError) {
    console.error('[api/dashboard/landing-performance] link_clicks query failed:', clicksError.message);
    return NextResponse.json({ error: 'Failed to load link clicks' }, { status: 500 });
  }
  const clicks: LinkClick[] = clicksRaw ?? [];

  // Fetch leads — include all leads in range (pre-tracking leads will have null utm_source)
  let leadsQuery = supabase
    .from('investor_leads')
    .select('id, created_at, name, email, mobile, locale, utm_source, consent_marketing')
    .gte('created_at', sinceTs)
    .lte('created_at', untilTs)
    .order('created_at', { ascending: false });
  if (utmSourceFilter) leadsQuery = leadsQuery.eq('utm_source', utmSourceFilter);
  const { data: leadsRaw, error: leadsError } = await leadsQuery;
  if (leadsError) {
    console.error('[api/dashboard/landing-performance] investor_leads query failed:', leadsError.message);
    return NextResponse.json({ error: 'Failed to load leads' }, { status: 500 });
  }
  const leads: LeadRow[] = leadsRaw ?? [];

  // Fetch Persuadis leads captured via the koby@grupoyakgu.es email
  // automation (lib/process-email-leads.ts) -- a separate intake from the
  // BDS36 landing page's own form, with no page-view data behind it, so
  // these are only added to the leads listing below, not folded into the
  // views/submissions funnel or the by-network breakdown (which model that
  // specific tracked funnel). Skipped when a specific social network filter
  // is active, since none of these are ever attributed to one.
  let emailLeads: EmailLeadRow[] = [];
  if (!utmSourceFilter) {
    const { data: emailLeadsRaw, error: emailLeadsError } = await supabase
      .from('email_leads')
      .select('id, created_at, name, apellidos, phone, email, gmail_message_id')
      .gte('created_at', sinceTs)
      .lte('created_at', untilTs)
      .order('created_at', { ascending: false });
    if (emailLeadsError) {
      console.error('[api/dashboard/landing-performance] email_leads query failed:', emailLeadsError.message);
      return NextResponse.json({ error: 'Failed to load email leads' }, { status: 500 });
    }
    emailLeads = emailLeadsRaw ?? [];
  }

  const views = events.length;
  // Every lead counts as a submission -- one with no utm_source is real
  // direct traffic (someone who visited without a campaign link), not
  // untracked data to exclude, so it's labeled 'direct' below rather than
  // dropped from the totals.
  const submissions = leads.length;
  const conversionRate = views > 0 ? submissions / views : 0;

  // By network — group events and leads by utm_source (null -> 'direct')
  const networkSources = Array.from(new Set([
    ...events.map(e => e.utm_source ?? 'direct'),
    ...leads.map(l => l.utm_source ?? 'direct'),
  ]));

  const byNetwork = networkSources.map(source => {
    const networkViews = events.filter(e => (e.utm_source ?? 'direct') === source).length;
    const networkSubs = leads.filter(l => (l.utm_source ?? 'direct') === source).length;
    return {
      source,
      views: networkViews,
      submissions: networkSubs,
      conversionRate: networkViews > 0 ? networkSubs / networkViews : 0,
    };
  }).sort((a, b) => b.views - a.views);

  // By locale
  const locales = Array.from(new Set([
    ...events.map(e => e.locale),
    ...leads.map(l => l.locale),
  ]));
  const byLocale = locales.map(locale => {
    const localeViews = events.filter(e => e.locale === locale).length;
    const localeSubs = leads.filter(l => l.locale === locale).length;
    return {
      locale,
      views: localeViews,
      submissions: localeSubs,
      conversionRate: localeViews > 0 ? localeSubs / localeViews : 0,
    };
  }).sort((a, b) => b.submissions - a.submissions);

  // Time series — group by date
  const dateMap = new Map<string, { views: number; submissions: number }>();
  for (const e of events) {
    const date = isoDate(new Date(e.created_at));
    const existing = dateMap.get(date) ?? { views: 0, submissions: 0 };
    dateMap.set(date, { ...existing, views: existing.views + 1 });
  }
  for (const l of leads) {
    const date = isoDate(new Date(l.created_at));
    const existing = dateMap.get(date) ?? { views: 0, submissions: 0 };
    dateMap.set(date, { ...existing, submissions: existing.submissions + 1 });
  }
  const timeSeries = Array.from(dateMap.entries())
    .map(([date, counts]) => ({ date, ...counts }))
    .sort((a, b) => a.date.localeCompare(b.date));

  return NextResponse.json({
    clicks: clicks.length,
    views,
    submissions,
    conversionRate,
    byNetwork,
    byLocale,
    timeSeries,
    leads: [
      ...leads.map(l => ({
        id: l.id,
        created_at: l.created_at,
        name: l.name,
        email: l.email,
        mobile: l.mobile,
        locale: l.locale,
        source: l.utm_source ?? 'direct',
        consent_marketing: l.consent_marketing,
        mail_url: null as string | null,
      })),
      ...emailLeads.map(l => ({
        id: l.id,
        created_at: l.created_at,
        name: [l.name, l.apellidos].filter(Boolean).join(' ') || (l.name ?? '—'),
        email: l.email ?? '—',
        mobile: l.phone ?? '—',
        locale: 'es',
        source: 'website',
        consent_marketing: false,
        mail_url: gmailMessageUrl(l.gmail_message_id),
      })),
    ].sort((a, b) => b.created_at.localeCompare(a.created_at)),
  });
}
