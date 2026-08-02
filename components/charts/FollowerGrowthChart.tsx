'use client';

import type { ReactNode } from 'react';
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer } from 'recharts';

export interface FollowerHistoryPoint {
  platform: 'linkedin' | 'instagram' | 'facebook';
  date: string;
  followers: number;
}

const PLATFORM_COLOR: Record<string, string> = {
  facebook: '#1877F2',
  instagram: '#E1306C',
  linkedin: '#0A66C2',
};

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

export function FollowerGrowthChart({ data }: { data: FollowerHistoryPoint[] }) {
  const dates = Array.from(new Set(data.map(d => d.date))).sort();
  const platforms = Array.from(new Set(data.map(d => d.platform)));

  const rows = dates.map(date => {
    const row: Record<string, string | number> = { date };
    for (const platform of platforms) {
      const point = data.find(d => d.date === date && d.platform === platform);
      if (point) row[platform] = point.followers;
    }
    return row;
  });

  if (rows.length < 2) {
    return (
      <div className="flex h-64 items-center justify-center text-sm text-neutral-400 dark:text-neutral-500">
        Not enough history yet — check back after a few more snapshots.
      </div>
    );
  }

  return (
    <ResponsiveContainer width="100%" height={260}>
      <LineChart data={rows} margin={{ top: 4, right: 8, left: -16, bottom: 0 }}>
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
        />
        <Legend wrapperStyle={{ fontSize: 12 }} />
        {platforms.map(platform => (
          <Line
            key={platform}
            type="monotone"
            dataKey={platform}
            stroke={PLATFORM_COLOR[platform] ?? '#525252'}
            strokeWidth={2}
            dot={false}
            connectNulls
          />
        ))}
      </LineChart>
    </ResponsiveContainer>
  );
}
