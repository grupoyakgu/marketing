'use client';

import type { ReactNode } from 'react';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts';

export interface PostsByDate {
  date: string;
  count: number;
}

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

export function PostsOverTimeChart({ data }: { data: PostsByDate[] }) {
  if (data.length === 0) {
    return (
      <div className="flex h-64 items-center justify-center text-sm text-neutral-400 dark:text-neutral-500">
        No posts published in this window yet.
      </div>
    );
  }

  return (
    <ResponsiveContainer width="100%" height={260}>
      <BarChart data={data} margin={{ top: 4, right: 8, left: -16, bottom: 0 }}>
        <CartesianGrid strokeDasharray="3 3" className="stroke-neutral-100 dark:stroke-neutral-800" />
        <XAxis
          dataKey="date"
          tick={{ fontSize: 12 }}
          stroke="currentColor"
          className="text-neutral-400"
          tickFormatter={formatDate}
        />
        <YAxis allowDecimals={false} tick={{ fontSize: 12 }} stroke="currentColor" className="text-neutral-400" />
        <Tooltip
          contentStyle={{ borderRadius: 12, border: '1px solid #e5e5e5', fontSize: 13 }}
          labelFormatter={formatTooltipLabel}
        />
        <Bar dataKey="count" name="Posts published" fill="#6366f1" radius={[6, 6, 0, 0]} />
      </BarChart>
    </ResponsiveContainer>
  );
}
