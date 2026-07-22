'use client';

import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts';

export interface AdDailyPoint {
  date: string;
  spend: number;
  impressions: number;
  reach: number;
}

export function AdSpendChart({ data, currency }: { data: AdDailyPoint[]; currency: string }) {
  if (data.length < 2) {
    return (
      <div className="flex h-56 items-center justify-center text-sm text-neutral-400 dark:text-neutral-500">
        Not enough daily data yet for this range.
      </div>
    );
  }

  return (
    <ResponsiveContainer width="100%" height={240}>
      <LineChart data={data} margin={{ top: 4, right: 8, left: -16, bottom: 0 }}>
        <CartesianGrid strokeDasharray="3 3" className="stroke-neutral-100 dark:stroke-neutral-800" />
        <XAxis dataKey="date" tick={{ fontSize: 12 }} stroke="currentColor" className="text-neutral-400" />
        <YAxis tick={{ fontSize: 12 }} stroke="currentColor" className="text-neutral-400" />
        <Tooltip
          contentStyle={{ borderRadius: 12, border: '1px solid #e5e5e5', fontSize: 13 }}
          labelStyle={{ fontWeight: 600 }}
          formatter={(value => [`${currency} ${Number(value ?? 0).toFixed(2)}`, 'Spend']) as (value: unknown) => [string, string]}
        />
        <Line type="monotone" dataKey="spend" stroke="#6366f1" strokeWidth={2} dot={false} />
      </LineChart>
    </ResponsiveContainer>
  );
}
