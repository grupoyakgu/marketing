'use client';

import { useCallback, useEffect, useState } from 'react';
import {
  Eye,
  TrendingUp,
  MousePointerClick,
  CheckSquare,
  LayoutTemplate,
  Calendar,
} from 'lucide-react';
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
} from 'recharts';
import { Card } from '@/components/ui/Card';
import { KpiCard } from '@/components/ui/KpiCard';
import { cn } from '@/lib/cn';

// ── Types ────────────────────────────────────────────────────────────────────

interface NetworkRow {
  source: string;
  views: number;
  submissions: number;
  conversionRate: number;
}

interface LocaleRow {
  locale: string;
  views: number;
  submissions: number;
  conversionRate: number;
}

interface TimeSeriesPoint {
  date: string;
  views: number;
  submissions: number;
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

interface DashboardData {
  clicks: number;
  views: number;
  submissions: number;
  conversionRate: number;
  byNetwork: NetworkRow[];
  byLocale: LocaleRow[];
  timeSeries: TimeSeriesPoint[];
  leads: LeadRow[];
}

// ── Constants ────────────────────────────────────────────────────────────────

type Preset = '7d' | '30d' | '90d' | 'custom';
type NetworkFilter = 'all' | 'linkedin' | 'facebook' | 'instagram';
type Granularity = 'daily' | 'weekly';

const PRESETS: { value: Preset; label: string }[] = [
  { value: '7d', label: 'Last 7d' },
  { value: '30d', label: 'Last 30d' },
  { value: '90d', label: 'Last 90d' },
  { value: 'custom', label: 'Custom' },
];

const NETWORK_FILTERS: { value: NetworkFilter; label: string }[] = [
  { value: 'all', label: 'All' },
  { value: 'linkedin', label: 'LinkedIn' },
  { value: 'facebook', label: 'Facebook' },
  { value: 'instagram', label: 'Instagram' },
];

const NETWORK_COLORS: Record<string, string> = {
  linkedin: '#0A66C2',
  facebook: '#1877F2',
  instagram: '#E1306C',
  direct: '#6b7280',
};

const LOCALE_FLAGS: Record<string, string> = { es: '🇪🇸', en: '🇬🇧', he: '🇮🇱' };

const LEADS_PER_PAGE = 20;

// ── Helpers ──────────────────────────────────────────────────────────────────

function isoDate(d: Date): string {
  return d.toISOString().split('T')[0];
}

function presetRange(preset: Preset): { since: string; until: string } {
  const until = new Date();
  const since = new Date();
  if (preset === '7d') since.setDate(since.getDate() - 6);
  else if (preset === '30d') since.setDate(since.getDate() - 29);
  else if (preset === '90d') since.setDate(since.getDate() - 89);
  return { since: isoDate(since), until: isoDate(until) };
}

function formatPct(rate: number): string {
  return `${(rate * 100).toFixed(1)}%`;
}

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' });
}

function groupWeekly(series: TimeSeriesPoint[]): TimeSeriesPoint[] {
  const map = new Map<string, TimeSeriesPoint>();
  for (const point of series) {
    const d = new Date(point.date);
    // ISO week start = Monday
    const day = d.getDay();
    const diff = (day === 0 ? -6 : 1) - day;
    const monday = new Date(d);
    monday.setDate(d.getDate() + diff);
    const key = isoDate(monday);
    const existing = map.get(key) ?? { date: key, views: 0, submissions: 0 };
    map.set(key, {
      date: key,
      views: existing.views + point.views,
      submissions: existing.submissions + point.submissions,
    });
  }
  return Array.from(map.values()).sort((a, b) => a.date.localeCompare(b.date));
}

// ── Main component ────────────────────────────────────────────────────────────

export default function LandingPerformancePage() {
  const [preset, setPreset] = useState<Preset>('30d');
  const [range, setRange] = useState(() => presetRange('30d'));
  const [networkFilter, setNetworkFilter] = useState<NetworkFilter>('all');
  const [granularity, setGranularity] = useState<Granularity>('daily');
  const [data, setData] = useState<DashboardData | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [leadsPage, setLeadsPage] = useState(0);

  const load = useCallback(async () => {
    setError(null);
    setData(null);
    const params = new URLSearchParams({
      since: range.since,
      until: range.until,
      landing_page: 'bds36',
    });
    if (networkFilter !== 'all') params.set('utm_source', networkFilter);
    try {
      const res = await fetch(`/api/dashboard/landing-performance?${params}`);
      const body = await res.json();
      if (!res.ok) throw new Error(body.error ?? 'Failed to load data');
      setData(body);
      setLeadsPage(0);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load data');
    }
  }, [range, networkFilter]);

  useEffect(() => { load(); }, [load]);

  function handlePreset(p: Preset) {
    setPreset(p);
    if (p !== 'custom') setRange(presetRange(p));
  }

  const chartSeries = data
    ? (granularity === 'weekly' ? groupWeekly(data.timeSeries) : data.timeSeries)
    : [];

  const totalLeads = data?.leads.length ?? 0;
  const totalLeadPages = Math.ceil(totalLeads / LEADS_PER_PAGE);
  const pagedLeads = data?.leads.slice(leadsPage * LEADS_PER_PAGE, (leadsPage + 1) * LEADS_PER_PAGE) ?? [];

  return (
    <div className="mx-auto max-w-5xl space-y-6">
      {/* Header */}
      <div>
        <h1 className="flex items-center gap-2 text-2xl font-semibold tracking-tight text-neutral-900 dark:text-white">
          <LayoutTemplate className="h-5 w-5" />
          Landing Pages
        </h1>
        <p className="mt-1 text-sm text-neutral-500 dark:text-neutral-400">
          Pageviews, leads, and conversion for the BDS36 investor landing page.
        </p>
      </div>

      {/* Filter bar */}
      <Card className="flex flex-wrap items-center gap-4">
        {/* Landing page — single static pill for now */}
        <div className="flex items-center gap-2">
          <span className="text-xs font-medium text-neutral-500 dark:text-neutral-400">Page</span>
          <div className="rounded-xl bg-neutral-100 p-1 dark:bg-neutral-800">
            <span className="rounded-lg bg-white px-2.5 py-1 text-xs font-medium text-neutral-900 shadow-sm dark:bg-neutral-700 dark:text-white">
              BDS 36
            </span>
          </div>
        </div>

        {/* Network filter */}
        <div className="flex items-center gap-2">
          <span className="text-xs font-medium text-neutral-500 dark:text-neutral-400">Network</span>
          <div className="flex gap-1 rounded-xl bg-neutral-100 p-1 dark:bg-neutral-800">
            {NETWORK_FILTERS.map(f => (
              <button
                key={f.value}
                onClick={() => setNetworkFilter(f.value)}
                className={cn(
                  'rounded-lg px-2.5 py-1 text-xs font-medium transition',
                  networkFilter === f.value
                    ? 'bg-white text-neutral-900 shadow-sm dark:bg-neutral-700 dark:text-white'
                    : 'text-neutral-500 dark:text-neutral-400'
                )}
              >
                {f.label}
              </button>
            ))}
          </div>
        </div>

        {/* Date range */}
        <div className="flex items-center gap-2">
          <span className="text-xs font-medium text-neutral-500 dark:text-neutral-400">
            <Calendar className="mr-1 inline h-3.5 w-3.5" />
            Range
          </span>
          <div className="flex gap-1 rounded-xl bg-neutral-100 p-1 dark:bg-neutral-800">
            {PRESETS.map(p => (
              <button
                key={p.value}
                onClick={() => handlePreset(p.value)}
                className={cn(
                  'rounded-lg px-2.5 py-1 text-xs font-medium transition',
                  preset === p.value
                    ? 'bg-white text-neutral-900 shadow-sm dark:bg-neutral-700 dark:text-white'
                    : 'text-neutral-500 dark:text-neutral-400'
                )}
              >
                {p.label}
              </button>
            ))}
          </div>
        </div>

        {preset === 'custom' && (
          <div className="flex items-center gap-2">
            <input
              type="date"
              value={range.since}
              onChange={e => setRange(r => ({ ...r, since: e.target.value }))}
              className="rounded-lg border border-neutral-200 bg-neutral-50 px-2 py-1 text-xs dark:border-neutral-700 dark:bg-neutral-800 dark:text-white"
            />
            <span className="text-xs text-neutral-400">to</span>
            <input
              type="date"
              value={range.until}
              onChange={e => setRange(r => ({ ...r, until: e.target.value }))}
              className="rounded-lg border border-neutral-200 bg-neutral-50 px-2 py-1 text-xs dark:border-neutral-700 dark:bg-neutral-800 dark:text-white"
            />
          </div>
        )}
      </Card>

      {error && <p className="text-sm text-red-600 dark:text-red-400">{error}</p>}

      {/* KPI cards */}
      <section className="grid grid-cols-2 gap-4 sm:grid-cols-4">
        <KpiCard
          label="Link Clicks"
          value="—"
          icon={MousePointerClick}
          tooltip="Click tracking requires UTM-tagged links — data will appear here once posts go live with UTM parameters."
        />
        <KpiCard
          label="Page Views"
          value={data?.views ?? '—'}
          icon={Eye}
        />
        <KpiCard
          label="Form Submissions"
          value={data?.submissions ?? '—'}
          icon={CheckSquare}
        />
        <KpiCard
          label="Conversion Rate"
          value={data ? formatPct(data.conversionRate) : '—'}
          icon={TrendingUp}
        />
      </section>

      {/* Funnel */}
      <Card className="space-y-4">
        <h3 className="text-sm font-semibold text-neutral-900 dark:text-white">Funnel</h3>
        <div className="flex items-center gap-0">
          {/* Step 1 — Clicks (always empty for now) */}
          <div className="flex flex-1 flex-col items-center gap-1 rounded-xl bg-neutral-100 px-4 py-5 dark:bg-neutral-800">
            <span className="text-xs font-medium text-neutral-500 dark:text-neutral-400">Link Clicks</span>
            <span className="text-2xl font-bold text-neutral-400">—</span>
          </div>
          {/* Chevron */}
          <div className="flex flex-col items-center px-2 text-center">
            <span className="text-lg text-neutral-300 dark:text-neutral-600">›</span>
            <span className="text-xs text-neutral-400">—</span>
          </div>
          {/* Step 2 — Views */}
          <div className="flex flex-1 flex-col items-center gap-1 rounded-xl bg-amber-50 px-4 py-5 dark:bg-amber-900/20">
            <span className="text-xs font-medium text-neutral-500 dark:text-neutral-400">Page Views</span>
            <span className="text-2xl font-bold text-amber-500">{data?.views ?? '—'}</span>
          </div>
          {/* Chevron with drop-off */}
          <div className="flex flex-col items-center px-2 text-center">
            <span className="text-lg text-neutral-300 dark:text-neutral-600">›</span>
            <span className="text-xs text-neutral-400">
              {data && data.views > 0
                ? `${(((data.views - data.submissions) / data.views) * 100).toFixed(0)}% drop`
                : '—'}
            </span>
          </div>
          {/* Step 3 — Submissions */}
          <div className="flex flex-1 flex-col items-center gap-1 rounded-xl bg-green-50 px-4 py-5 dark:bg-green-900/20">
            <span className="text-xs font-medium text-neutral-500 dark:text-neutral-400">Submissions</span>
            <span className="text-2xl font-bold text-green-500">{data?.submissions ?? '—'}</span>
          </div>
        </div>
      </Card>

      {/* Time series chart */}
      <Card className="space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h3 className="text-sm font-semibold text-neutral-900 dark:text-white">Over time</h3>
          <div className="flex gap-1 rounded-xl bg-neutral-100 p-1 dark:bg-neutral-800">
            {(['daily', 'weekly'] as const).map(g => (
              <button
                key={g}
                onClick={() => setGranularity(g)}
                className={cn(
                  'rounded-lg px-2.5 py-1 text-xs font-medium capitalize transition',
                  granularity === g
                    ? 'bg-white text-neutral-900 shadow-sm dark:bg-neutral-700 dark:text-white'
                    : 'text-neutral-500 dark:text-neutral-400'
                )}
              >
                {g.charAt(0).toUpperCase() + g.slice(1)}
              </button>
            ))}
          </div>
        </div>
        {data === null ? (
          <p className="py-10 text-center text-sm text-neutral-400">Loading…</p>
        ) : chartSeries.length === 0 ? (
          <p className="py-10 text-center text-sm text-neutral-400">No data yet for this period.</p>
        ) : (
          <ResponsiveContainer width="100%" height={260}>
            <LineChart data={chartSeries} margin={{ top: 4, right: 8, left: -16, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" className="stroke-neutral-100 dark:stroke-neutral-800" />
              <XAxis
                dataKey="date"
                tick={{ fontSize: 12 }}
                stroke="currentColor"
                className="text-neutral-400"
                tickFormatter={formatDate}
              />
              <YAxis tick={{ fontSize: 12 }} stroke="currentColor" className="text-neutral-400" />
              <Tooltip
                contentStyle={{ borderRadius: 12, border: '1px solid #e5e5e5', fontSize: 13 }}
                labelStyle={{ fontWeight: 600 }}
                labelFormatter={(label: unknown) => typeof label === 'string' ? formatDate(label) : String(label)}
                formatter={(value: unknown, name: unknown) => [Number(value ?? 0).toLocaleString(), String(name)]}
              />
              <Legend wrapperStyle={{ fontSize: 12 }} />
              <Line
                type="monotone"
                dataKey="views"
                name="Views"
                stroke="#2a78d6"
                strokeWidth={2}
                dot={false}
                connectNulls
              />
              <Line
                type="monotone"
                dataKey="submissions"
                name="Submissions"
                stroke="#f59e0b"
                strokeWidth={2}
                dot={false}
                connectNulls
              />
            </LineChart>
          </ResponsiveContainer>
        )}
      </Card>

      {/* Network breakdown */}
      <Card className="space-y-3">
        <h3 className="text-sm font-semibold text-neutral-900 dark:text-white">By network</h3>
        {data === null ? (
          <p className="text-sm text-neutral-400">Loading…</p>
        ) : data.byNetwork.length === 0 ? (
          <p className="text-sm text-neutral-400">
            No attributed traffic yet — make sure post links include UTM parameters.
          </p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-neutral-100 text-left text-xs text-neutral-500 dark:border-neutral-800 dark:text-neutral-400">
                  <th className="pb-2 font-medium">Network</th>
                  <th className="pb-2 font-medium">Views</th>
                  <th className="pb-2 font-medium">Submissions</th>
                  <th className="pb-2 font-medium">Conv. rate</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-neutral-50 dark:divide-neutral-800">
                {data.byNetwork.map(row => (
                  <tr key={row.source}>
                    <td className="py-2.5">
                      <span className="flex items-center gap-2 font-medium text-neutral-900 dark:text-white">
                        <span
                          className="h-2 w-2 rounded-full"
                          style={{ backgroundColor: NETWORK_COLORS[row.source] ?? NETWORK_COLORS.direct }}
                        />
                        <span className="capitalize">{row.source}</span>
                      </span>
                    </td>
                    <td className="py-2.5 text-neutral-700 dark:text-neutral-300">{row.views.toLocaleString()}</td>
                    <td className="py-2.5 text-neutral-700 dark:text-neutral-300">{row.submissions.toLocaleString()}</td>
                    <td className="py-2.5 text-neutral-700 dark:text-neutral-300">{formatPct(row.conversionRate)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      {/* Locale split */}
      <Card className="space-y-3">
        <h3 className="text-sm font-semibold text-neutral-900 dark:text-white">By locale</h3>
        {data === null ? (
          <p className="text-sm text-neutral-400">Loading…</p>
        ) : (
          <div className="grid grid-cols-3 gap-4">
            {(['es', 'en', 'he'] as const).map(locale => {
              const row = data.byLocale.find(r => r.locale === locale);
              return (
                <div
                  key={locale}
                  className="flex flex-col items-center gap-1 rounded-xl border border-neutral-100 p-4 text-center dark:border-neutral-800"
                >
                  <span className="text-2xl">{LOCALE_FLAGS[locale]}</span>
                  <span className="text-xs font-medium uppercase text-neutral-500 dark:text-neutral-400">{locale}</span>
                  <span className="text-xl font-bold text-neutral-900 dark:text-white">
                    {row?.submissions ?? 0}
                    <span className="ml-1 text-xs font-normal text-neutral-400">leads</span>
                  </span>
                  <span className="text-xs text-neutral-400">
                    {row?.views ?? 0} views · {row ? formatPct(row.conversionRate) : '0.0%'} conv.
                  </span>
                </div>
              );
            })}
          </div>
        )}
      </Card>

      {/* Leads table */}
      <Card className="space-y-3">
        <div className="flex items-center gap-2">
          <h3 className="text-sm font-semibold text-neutral-900 dark:text-white">Leads</h3>
          {data !== null && (
            <span className="rounded-full bg-neutral-100 px-2 py-0.5 text-xs font-medium text-neutral-600 dark:bg-neutral-800 dark:text-neutral-300">
              {totalLeads}
            </span>
          )}
        </div>
        {data === null ? (
          <p className="text-sm text-neutral-400">Loading…</p>
        ) : totalLeads === 0 ? (
          <p className="text-sm text-neutral-400">No leads captured yet in this period.</p>
        ) : (
          <>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-neutral-100 text-left text-xs text-neutral-500 dark:border-neutral-800 dark:text-neutral-400">
                    <th className="pb-2 font-medium">Date</th>
                    <th className="pb-2 font-medium">Name</th>
                    <th className="pb-2 font-medium">Email</th>
                    <th className="pb-2 font-medium">Mobile</th>
                    <th className="pb-2 font-medium">Locale</th>
                    <th className="pb-2 font-medium">Source</th>
                    <th className="pb-2 font-medium">Mktg.</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-neutral-50 dark:divide-neutral-800">
                  {pagedLeads.map(lead => (
                    <tr key={lead.id}>
                      <td className="py-2.5 text-xs text-neutral-500 dark:text-neutral-400">
                        {new Date(lead.created_at).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: '2-digit' })}
                      </td>
                      <td className="py-2.5 font-medium text-neutral-900 dark:text-white">{lead.name}</td>
                      <td className="py-2.5 text-neutral-600 dark:text-neutral-300">{lead.email}</td>
                      <td className="py-2.5 text-neutral-600 dark:text-neutral-300">{lead.mobile}</td>
                      <td className="py-2.5 text-center text-base">{LOCALE_FLAGS[lead.locale] ?? lead.locale}</td>
                      <td className="py-2.5">
                        {lead.utm_source ? (
                          <span className="flex items-center gap-1.5">
                            <span
                              className="h-1.5 w-1.5 rounded-full"
                              style={{ backgroundColor: NETWORK_COLORS[lead.utm_source] ?? NETWORK_COLORS.direct }}
                            />
                            <span className="capitalize text-neutral-700 dark:text-neutral-300">{lead.utm_source}</span>
                          </span>
                        ) : (
                          <span className="text-neutral-400">—</span>
                        )}
                      </td>
                      <td className="py-2.5 text-center">
                        {lead.consent_marketing
                          ? <span className="text-green-500">✓</span>
                          : <span className="text-neutral-400">—</span>}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            {totalLeadPages > 1 && (
              <div className="flex items-center justify-between text-xs text-neutral-500 dark:text-neutral-400">
                <span>
                  {leadsPage * LEADS_PER_PAGE + 1}–{Math.min((leadsPage + 1) * LEADS_PER_PAGE, totalLeads)} of {totalLeads}
                </span>
                <div className="flex gap-1">
                  <button
                    disabled={leadsPage === 0}
                    onClick={() => setLeadsPage(p => p - 1)}
                    className="rounded-lg px-2 py-1 transition hover:bg-neutral-100 disabled:opacity-40 dark:hover:bg-neutral-800"
                  >
                    ‹ Prev
                  </button>
                  <button
                    disabled={leadsPage >= totalLeadPages - 1}
                    onClick={() => setLeadsPage(p => p + 1)}
                    className="rounded-lg px-2 py-1 transition hover:bg-neutral-100 disabled:opacity-40 dark:hover:bg-neutral-800"
                  >
                    Next ›
                  </button>
                </div>
              </div>
            )}
          </>
        )}
      </Card>
    </div>
  );
}
