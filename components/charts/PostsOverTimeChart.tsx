'use client';

import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts';

export interface PostsByDate {
  date: string;
  count: number;
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
        <XAxis dataKey="date" tick={{ fontSize: 12 }} stroke="currentColor" className="text-neutral-400" />
        <YAxis allowDecimals={false} tick={{ fontSize: 12 }} stroke="currentColor" className="text-neutral-400" />
        <Tooltip contentStyle={{ borderRadius: 12, border: '1px solid #e5e5e5', fontSize: 13 }} />
        <Bar dataKey="count" name="Posts published" fill="#171717" radius={[6, 6, 0, 0]} />
      </BarChart>
    </ResponsiveContainer>
  );
}
