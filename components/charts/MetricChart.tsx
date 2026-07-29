'use client';

import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts';

export interface ActionTotals {
  likes: number;
  comments: number;
  shares: number;
  saves: number;
  linkClicks: number;
  profileVisits: number;
  follows: number;
  businessAddressTaps: number;
  externalLinkTaps: number;
  other: { actionType: string; value: number }[];
}

export interface DailyStat {
  date: string;
  spend: number;
  impressions: number;
  reach: number;
  actions: ActionTotals;
}

export type MetricKey = 'spend' | 'impressions' | 'reach' | 'likes' | 'comments' | 'shares' | 'saves' | 'clicks';

export const METRIC_OPTIONS: { value: MetricKey; label: string }[] = [
  { value: 'spend', label: 'Spend' },
  { value: 'impressions', label: 'Impressions' },
  { value: 'reach', label: 'Reach' },
  { value: 'likes', label: 'Likes' },
  { value: 'comments', label: 'Comments' },
  { value: 'shares', label: 'Shares' },
  { value: 'saves', label: 'Saves' },
  { value: 'clicks', label: 'Clicks' },
];

export function getMetricValue(d: DailyStat, metric: MetricKey): number {
  switch (metric) {
    case 'spend': return d.spend;
    case 'impressions': return d.impressions;
    case 'reach': return d.reach;
    case 'likes': return d.actions.likes;
    case 'comments': return d.actions.comments;
    case 'shares': return d.actions.shares;
    case 'saves': return d.actions.saves;
    case 'clicks': return d.actions.linkClicks;
  }
}

export function MetricChart({ data, metric, currency }: { data: DailyStat[]; metric: MetricKey; currency: string }) {
  if (data.length < 2) {
    return (
      <div className="flex h-56 items-center justify-center text-sm text-neutral-400 dark:text-neutral-500">
        Not enough daily data yet for this range.
      </div>
    );
  }

  const label = METRIC_OPTIONS.find(o => o.value === metric)?.label ?? metric;
  const points = data.map(d => ({ date: d.date, value: getMetricValue(d, metric) }));

  return (
    <ResponsiveContainer width="100%" height={260}>
      <LineChart data={points} margin={{ top: 4, right: 8, left: -16, bottom: 0 }}>
        <CartesianGrid strokeDasharray="3 3" className="stroke-neutral-100 dark:stroke-neutral-800" />
        <XAxis dataKey="date" tick={{ fontSize: 12 }} stroke="currentColor" className="text-neutral-400" />
        <YAxis tick={{ fontSize: 12 }} stroke="currentColor" className="text-neutral-400" />
        <Tooltip
          contentStyle={{ borderRadius: 12, border: '1px solid #e5e5e5', fontSize: 13 }}
          labelStyle={{ fontWeight: 600 }}
          formatter={
            ((value: unknown) => [
              metric === 'spend' ? `${currency} ${Number(value ?? 0).toFixed(2)}` : Number(value ?? 0).toLocaleString(),
              label,
            ]) as (value: unknown) => [string, string]
          }
        />
        <Line type="monotone" dataKey="value" stroke="#6366f1" strokeWidth={2} dot={false} />
      </LineChart>
    </ResponsiveContainer>
  );
}
