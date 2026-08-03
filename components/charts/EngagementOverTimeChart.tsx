'use client';

import type { ReactNode } from 'react';
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer } from 'recharts';

export interface EngagementOverTimePoint {
  date: string;
  impressions: number;
  reach: number;
  likes: number;
  comments: number;
}

// Reach/impressions and likes/comments live on wildly different scales for an
// organic page — plotting all four on one axis flattens likes/comments to a
// near-flat line at the bottom. Two small-multiple charts, each holding a
// same-scale pair, instead of one four-line chart on a shared axis.
const SERIES_COLOR = { primary: '#2a78d6', secondary: '#eb6834' };

function formatDate(value: string): string {
  const d = new Date(value);
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

// Recharts calls Tooltip's labelFormatter with `label: ReactNode` (it can be
// undefined, a number, an element — not just the string dates this chart
// actually uses), unlike XAxis's tickFormatter which always passes a real
// date string. formatDate's stricter (value: string) => string signature
// isn't assignable to that looser callback type, hence this adapter.
function formatTooltipLabel(label: ReactNode): ReactNode {
  return typeof label === 'string' ? formatDate(label) : label;
}

function formatTooltipValue(value: unknown, name: string): [string, string] {
  return [Number(value ?? 0).toLocaleString(), name];
}

function TwoLineChart({
  data,
  series,
}: {
  data: EngagementOverTimePoint[];
  series: [
    { key: 'impressions' | 'reach' | 'likes' | 'comments'; label: string },
    { key: 'impressions' | 'reach' | 'likes' | 'comments'; label: string },
  ];
}) {
  if (data.length < 2) {
    return (
      <div className="flex h-64 items-center justify-center text-sm text-neutral-400 dark:text-neutral-500">
        Not enough history yet — check back after a few more posts are published.
      </div>
    );
  }

  return (
    <ResponsiveContainer width="100%" height={260}>
      <LineChart data={data} margin={{ top: 4, right: 8, left: -16, bottom: 0 }}>
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
          labelFormatter={formatTooltipLabel}
          formatter={formatTooltipValue as (value: unknown, name: unknown) => [string, string]}
        />
        <Legend wrapperStyle={{ fontSize: 12 }} />
        <Line
          type="monotone"
          dataKey={series[0].key}
          name={series[0].label}
          stroke={SERIES_COLOR.primary}
          strokeWidth={2}
          dot={false}
          connectNulls
        />
        <Line
          type="monotone"
          dataKey={series[1].key}
          name={series[1].label}
          stroke={SERIES_COLOR.secondary}
          strokeWidth={2}
          dot={false}
          connectNulls
        />
      </LineChart>
    </ResponsiveContainer>
  );
}

export function ReachImpressionsChart({ data }: { data: EngagementOverTimePoint[] }) {
  return (
    <TwoLineChart
      data={data}
      series={[
        { key: 'reach', label: 'Reach' },
        { key: 'impressions', label: 'Impressions' },
      ]}
    />
  );
}

export function LikesCommentsChart({ data }: { data: EngagementOverTimePoint[] }) {
  return (
    <TwoLineChart
      data={data}
      series={[
        { key: 'likes', label: 'Likes' },
        { key: 'comments', label: 'Comments' },
      ]}
    />
  );
}
