'use client';

import { useEffect, useState } from 'react';
import { X, Pause, Calendar, Wallet } from 'lucide-react';
import { Button } from '@/components/ui/Button';
import { Badge } from '@/components/ui/Badge';
import { PlatformBadge } from '@/components/ui/PlatformBadge';
import { AdSpendChart } from '@/components/charts/AdSpendChart';
import type { AdPlatform } from '@/lib/meta-ads';

interface CampaignDetail {
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
  dailySeries: { date: string; spend: number; impressions: number; reach: number }[];
  currency: string;
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

export function CampaignDetailPanel({
  campaignId,
  accountId,
  platform,
  since,
  until,
  onClose,
  onPaused,
}: {
  campaignId: string;
  accountId: string;
  platform: AdPlatform | 'all';
  since: string;
  until: string;
  onClose: () => void;
  onPaused: () => void;
}) {
  const [detail, setDetail] = useState<CampaignDetail | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pausing, setPausing] = useState(false);

  useEffect(() => {
    setDetail(null);
    setError(null);
    const params = new URLSearchParams({ since, until, account: accountId });
    if (platform !== 'all') params.set('platform', platform);
    fetch(`/api/dashboard/ads/campaigns/${campaignId}?${params}`)
      .then(res => res.json())
      .then(body => {
        if (body.campaign) setDetail(body.campaign);
        else setError(body.error ?? 'Failed to load campaign.');
      })
      .catch(() => setError('Failed to load campaign.'));
  }, [campaignId, accountId, platform, since, until]);

  async function handlePause() {
    if (!window.confirm('Pause this campaign? It will stop delivering immediately.')) return;
    setPausing(true);
    try {
      const res = await fetch(`/api/dashboard/ads/campaigns/${campaignId}/pause`, { method: 'POST' });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(body.error ?? 'Failed to pause campaign.');
      onPaused();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to pause campaign.');
    } finally {
      setPausing(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex justify-end">
      <div className="absolute inset-0 bg-black/20" onClick={onClose} />
      <div className="relative flex h-full w-full max-w-md flex-col overflow-y-auto border-l border-neutral-200 bg-white p-6 shadow-xl dark:border-neutral-800 dark:bg-neutral-900">
        <div className="mb-6 flex items-center justify-between">
          <h2 className="text-lg font-semibold text-neutral-900 dark:text-white">Campaign</h2>
          <button onClick={onClose} className="rounded-lg p-1.5 text-neutral-400 hover:bg-neutral-100 dark:hover:bg-neutral-800">
            <X className="h-4 w-4" />
          </button>
        </div>

        {error && <p className="mb-4 text-sm text-red-600 dark:text-red-400">{error}</p>}

        {!detail ? (
          <p className="text-sm text-neutral-400">Loading…</p>
        ) : (
          <div className="space-y-5">
            <div>
              <div className="mb-1 flex items-center gap-2">
                {detail.platformBreakdown.map(p => (
                  <PlatformBadge key={p.platform} platform={p.platform} />
                ))}
                <Badge tone={detail.status === 'ACTIVE' ? 'positive' : 'neutral'}>{detail.status}</Badge>
              </div>
              <h3 className="text-base font-semibold text-neutral-900 dark:text-white">{detail.name}</h3>
              <p className="text-xs text-neutral-400">{detail.objective}</p>
            </div>

            <div className="grid grid-cols-2 gap-3 rounded-xl border border-neutral-200 p-3 text-sm dark:border-neutral-700">
              <div className="flex items-center gap-1.5 text-neutral-500 dark:text-neutral-400">
                <Wallet className="h-3.5 w-3.5" /> Budget
              </div>
              <div className="text-right text-neutral-900 dark:text-white">
                {detail.dailyBudget !== null
                  ? `${formatMoney(detail.dailyBudget, detail.currency)}/day`
                  : detail.lifetimeBudget !== null
                    ? `${formatMoney(detail.lifetimeBudget, detail.currency)} lifetime`
                    : '—'}
              </div>
              <div className="flex items-center gap-1.5 text-neutral-500 dark:text-neutral-400">
                <Calendar className="h-3.5 w-3.5" /> Runs
              </div>
              <div className="text-right text-neutral-900 dark:text-white">
                {formatDate(detail.startTime)} – {detail.endTime ? formatDate(detail.endTime) : 'ongoing'}
              </div>
              <div className="text-neutral-500 dark:text-neutral-400">Spent to date</div>
              <div className="text-right font-medium text-neutral-900 dark:text-white">
                {formatMoney(detail.lifetimeSpend, detail.currency)}
              </div>
            </div>

            <div className="grid grid-cols-3 gap-3 text-center">
              <div>
                <p className="text-xs text-neutral-500 dark:text-neutral-400">Spend (range)</p>
                <p className="text-sm font-semibold text-neutral-900 dark:text-white">
                  {formatMoney(detail.windowSpend, detail.currency)}
                </p>
              </div>
              <div>
                <p className="text-xs text-neutral-500 dark:text-neutral-400">Impressions</p>
                <p className="text-sm font-semibold text-neutral-900 dark:text-white">
                  {detail.windowImpressions.toLocaleString()}
                </p>
              </div>
              <div>
                <p className="text-xs text-neutral-500 dark:text-neutral-400">Reach</p>
                <p className="text-sm font-semibold text-neutral-900 dark:text-white">
                  {detail.windowReach.toLocaleString()}
                </p>
              </div>
            </div>

            <div>
              <h4 className="mb-2 text-sm font-semibold text-neutral-900 dark:text-white">Spend over time</h4>
              <AdSpendChart data={detail.dailySeries} currency={detail.currency} />
            </div>

            {detail.status === 'ACTIVE' && (
              <Button variant="danger" onClick={handlePause} disabled={pausing} className="w-full">
                <Pause className="h-4 w-4" />
                {pausing ? 'Pausing…' : 'Pause campaign'}
              </Button>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
