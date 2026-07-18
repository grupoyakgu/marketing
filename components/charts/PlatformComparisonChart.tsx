'use client';

import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Cell } from 'recharts';

export interface PlatformFollowers {
  platform: 'linkedin' | 'instagram' | 'facebook';
  followers: number;
}

const PLATFORM_COLOR: Record<string, string> = {
  facebook: '#1877F2',
  instagram: '#E1306C',
  linkedin: '#0A66C2',
};

const PLATFORM_LABEL: Record<string, string> = {
  facebook: 'Facebook',
  instagram: 'Instagram',
  linkedin: 'LinkedIn',
};

export function PlatformComparisonChart({ data }: { data: PlatformFollowers[] }) {
  const rows = data.map(d => ({ ...d, label: PLATFORM_LABEL[d.platform] ?? d.platform }));

  if (rows.length === 0) {
    return (
      <div className="flex h-64 items-center justify-center text-sm text-neutral-400 dark:text-neutral-500">
        No platform data available.
      </div>
    );
  }

  return (
    <ResponsiveContainer width="100%" height={260}>
      <BarChart data={rows} margin={{ top: 4, right: 8, left: -16, bottom: 0 }}>
        <CartesianGrid strokeDasharray="3 3" className="stroke-neutral-100 dark:stroke-neutral-800" />
        <XAxis dataKey="label" tick={{ fontSize: 12 }} stroke="currentColor" className="text-neutral-400" />
        <YAxis allowDecimals={false} tick={{ fontSize: 12 }} stroke="currentColor" className="text-neutral-400" />
        <Tooltip contentStyle={{ borderRadius: 12, border: '1px solid #e5e5e5', fontSize: 13 }} />
        <Bar dataKey="followers" name="Followers" radius={[6, 6, 0, 0]}>
          {rows.map(r => (
            <Cell key={r.platform} fill={PLATFORM_COLOR[r.platform] ?? '#525252'} />
          ))}
        </Bar>
      </BarChart>
    </ResponsiveContainer>
  );
}
