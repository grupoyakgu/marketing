'use client';

import { useCallback, useEffect, useState } from 'react';
import { Megaphone, Wallet, TrendingUp, Eye, Calendar } from 'lucide-react';
import { Card } from '@/components/ui/Card';
import { Badge } from '@/components/ui/Badge';
import { PlatformBadge } from '@/components/ui/PlatformBadge';
import { KpiCard } from '@/components/ui/KpiCard';
import { CampaignDetailPanel } from '@/components/ads/CampaignDetailPanel';
import { cn } from '@/lib/cn';
import type { AdPlatform } from '@/lib/meta-ads';

interface CampaignRow {
  id: string;
  name: string;
  objective: string;
  status: string;
  dailyBudget: number | null;
  lifetimeBudget: number | null;
  startTime: string | null;
  endTime: string | null;
  lifetimeSpend: number;
  windowSpend: number;
  windowImpressions: number;
  windowReach: number;
  platformBreakdown: { platform: AdPlatform; spend: number; impressions: number; reach: number }[];
}

type Preset = 'today' | '7d' | '30d' | 'month' | 'custom';

function isoDate(d: Date): string {
  return d.toISOString().split('T')[0];
}

function presetRange(preset: Preset): { since: string; until: string } {
  const until = new Date();
  const since = new Date();
  if (preset === '7d') since.setDate(since.getDate() - 6);
  else if (preset === '30d') since.setDate(since.getDate() - 29);
  else if (preset === 'month') since.setDate(1);
  return { since: isoDate(since), until: isoDate(until) };
}

function formatMoney(amount: number, currency: string): string {
  try {
    return new Intl.NumberFormat(undefined, { style: 'currency', currency }).format(amount);
  } catch {
    return `${amount.toFixed(2)} ${currency}`;
  }
}

function formatDate(iso: string | null): string {
  if (!iso) return '—';
  return new Date(iso).toLocaleDateString(undefined, { dateStyle: 'medium' });
}

const PRESETS: { value: Preset; label: string }[] = [
  { value: 'today', label: 'Today' },
  { value: '7d', label: 'Last 7 days' },
  { value: '30d', label: 'Last 30 days' },
  { value: 'month', label: 'This month' },
  { value: 'custom', label: 'Custom' },
];

export default function AdsPage() {
  const [platform, setPlatform] = useState<AdPlatform | 'all'>('all');
  const [preset, setPreset] = useState<Preset>('30d');
  const [range, setRange] = useState(() => presetRange('30d'));
  const [configured, setConfigured] = useState<boolean | null>(null);
  const [currency, setCurrency] = useState('USD');
  const [campaigns, setCampaigns] = useState<CampaignRow[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);

  const load = useCallback(async () => {
    setError(null);
    const params = new URLSearchParams({ since: range.since, until: range.until });
    if (platform !== 'all') params.set('platform', platform);
    try {
      const res = await fetch(`/api/dashboard/ads/campaigns?${params}`);
      const body = await res.json();
      if (!res.ok) throw new Error(body.error ?? 'Failed to load ads dashboard.');
      setConfigured(body.configured);
      setCurrency(body.currency ?? 'USD');
      setCampaigns(body.campaigns ?? []);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load ads dashboard.');
      setCampaigns([]);
    }
  }, [platform, range]);

  useEffect(() => {
    load();
  }, [load]);

  function handlePreset(p: Preset) {
    setPreset(p);
    if (p !== 'custom') setRange(presetRange(p));
  }

  const totals = (campaigns ?? []).reduce(
    (acc, c) => ({
      spend: acc.spend + c.windowSpend,
      impressions: acc.impressions + c.windowImpressions,
      reach: acc.reach + c.windowReach,
      dailyBudget: acc.dailyBudget + (c.dailyBudget ?? 0),
      lifetimeBudget: acc.lifetimeBudget + (c.lifetimeBudget ?? 0),
      active: acc.active + (c.status === 'ACTIVE' ? 1 : 0),
    }),
    { spend: 0, impressions: 0, reach: 0, dailyBudget: 0, lifetimeBudget: 0, active: 0 }
  );

  return (
    <div className="mx-auto max-w-5xl space-y-6">
      <div>
        <h1 className="flex items-center gap-2 text-2xl font-semibold tracking-tight text-neutral-900 dark:text-white">
          <Megaphone className="h-5 w-5" />
          Ads
        </h1>
        <p className="mt-1 text-sm text-neutral-500 dark:text-neutral-400">
          Boost and campaign spend across Facebook and Instagram, via your direct Meta connection.
        </p>
      </div>

      {configured === false ? (
        <Card>
          <p className="text-sm text-neutral-500 dark:text-neutral-400">
            Not connected yet — set <code className="rounded bg-neutral-100 px-1 py-0.5 dark:bg-neutral-800">FACEBOOK_ADS_ACCESS_TOKEN</code> and{' '}
            <code className="rounded bg-neutral-100 px-1 py-0.5 dark:bg-neutral-800">FACEBOOK_AD_ACCOUNT_ID</code> to see campaign spend here.
          </p>
        </Card>
      ) : (
        <>
          <Card className="flex flex-wrap items-center gap-4">
            <div className="flex items-center gap-2">
              <span className="text-xs font-medium text-neutral-500 dark:text-neutral-400">Platform</span>
              <div className="flex gap-1 rounded-xl bg-neutral-100 p-1 dark:bg-neutral-800">
                {(['all', 'facebook', 'instagram'] as const).map(p => (
                  <button
                    key={p}
                    onClick={() => setPlatform(p)}
                    className={cn(
                      'rounded-lg px-2.5 py-1 text-xs font-medium capitalize transition',
                      platform === p
                        ? 'bg-white text-neutral-900 shadow-sm dark:bg-neutral-700 dark:text-white'
                        : 'text-neutral-500 dark:text-neutral-400'
                    )}
                  >
                    {p}
                  </button>
                ))}
              </div>
            </div>

            <div className="flex items-center gap-2">
              <span className="text-xs font-medium text-neutral-500 dark:text-neutral-400">
                <Calendar className="mr-1 inline h-3.5 w-3.5" />
                Range
              </span>
              <div className="flex flex-wrap gap-1 rounded-xl bg-neutral-100 p-1 dark:bg-neutral-800">
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

          <section className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-5">
            <KpiCard label="Spend (range)" value={formatMoney(totals.spend, currency)} icon={Wallet} />
            <KpiCard label="Impressions" value={totals.impressions} icon={Eye} />
            <KpiCard label="Reach" value={totals.reach} icon={TrendingUp} />
            <KpiCard label="Daily budgets" value={formatMoney(totals.dailyBudget, currency)} icon={Calendar} />
            <KpiCard label="Active campaigns" value={totals.active} icon={Megaphone} />
          </section>

          <div className="space-y-3">
            {campaigns === null ? (
              <p className="text-sm text-neutral-400">Loading campaigns…</p>
            ) : campaigns.length === 0 ? (
              <Card>
                <p className="text-sm text-neutral-400">No campaigns match this filter.</p>
              </Card>
            ) : (
              campaigns.map(c => (
                <Card
                  key={c.id}
                  className="cursor-pointer transition hover:border-neutral-300 dark:hover:border-neutral-700"
                  onClick={() => setSelectedId(c.id)}
                >
                  <div className="flex items-start justify-between gap-4">
                    <div className="min-w-0">
                      <div className="mb-1 flex items-center gap-1.5">
                        {c.platformBreakdown.length > 0 ? (
                          c.platformBreakdown.map(p => <PlatformBadge key={p.platform} platform={p.platform} />)
                        ) : (
                          <span className="text-xs text-neutral-400">No delivery in range</span>
                        )}
                        <Badge tone={c.status === 'ACTIVE' ? 'positive' : 'neutral'}>{c.status}</Badge>
                      </div>
                      <p className="truncate text-sm font-medium text-neutral-900 dark:text-white">{c.name}</p>
                      <p className="text-xs text-neutral-400">
                        {formatDate(c.startTime)} – {c.endTime ? formatDate(c.endTime) : 'ongoing'}
                      </p>
                    </div>
                    <div className="shrink-0 text-right">
                      <p className="text-sm font-semibold text-neutral-900 dark:text-white">
                        {formatMoney(c.windowSpend, currency)}
                      </p>
                      <p className="text-xs text-neutral-400">
                        {c.dailyBudget !== null
                          ? `${formatMoney(c.dailyBudget, currency)}/day`
                          : c.lifetimeBudget !== null
                            ? `${formatMoney(c.lifetimeBudget, currency)} total`
                            : 'no budget cap'}
                      </p>
                    </div>
                  </div>
                </Card>
              ))
            )}
          </div>
        </>
      )}

      {selectedId && (
        <CampaignDetailPanel
          campaignId={selectedId}
          platform={platform}
          since={range.since}
          until={range.until}
          onClose={() => setSelectedId(null)}
          onPaused={() => {
            setSelectedId(null);
            load();
          }}
        />
      )}
    </div>
  );
}
