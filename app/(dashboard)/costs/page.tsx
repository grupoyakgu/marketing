'use client';

import { useCallback, useEffect, useState } from 'react';
import { DollarSign, Hash, Zap, Calendar } from 'lucide-react';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts';
import { Card } from '@/components/ui/Card';
import { KpiCard } from '@/components/ui/KpiCard';
import { cn } from '@/lib/cn';

type Range = '7d' | '30d' | '90d';
type AgentName = 'pepe' | 'santi' | 'angeles' | 'abu' | 'leads';

interface AgentUsage {
  agent: AgentName;
  calls: number;
  inputTokens: number;
  outputTokens: number;
  cacheCreationTokens: number;
  cacheReadTokens: number;
  costUsd: number;
}

interface DailyCostPoint {
  date: string;
  costUsd: number;
}

interface UsageSummary {
  byAgent: AgentUsage[];
  byDay: DailyCostPoint[];
  totalCostUsd: number;
  totalCalls: number;
}

const RANGES: { value: Range; label: string }[] = [
  { value: '7d', label: 'Last 7d' },
  { value: '30d', label: 'Last 30d' },
  { value: '90d', label: 'Last 90d' },
];

const AGENT_LABELS: Record<AgentName, string> = {
  pepe: 'Pepe',
  santi: 'Santi',
  angeles: 'Angeles',
  abu: 'Abu',
  leads: 'Leads (lead extraction)',
};

const AGENT_COLORS: Record<AgentName, string> = {
  pepe: '#0A66C2',
  santi: '#6366f1',
  angeles: '#f59e0b',
  abu: '#10b981',
  leads: '#6b7280',
};

function formatUsd(value: number): string {
  return value < 0.01 && value > 0
    ? `$${value.toFixed(4)}`
    : `$${value.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' });
}

export default function CostsPage() {
  const [range, setRange] = useState<Range>('30d');
  const [data, setData] = useState<UsageSummary | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setError(null);
    setData(null);
    try {
      const res = await fetch(`/api/dashboard/costs?range=${range}`);
      const body = await res.json();
      if (!res.ok) throw new Error(body.error ?? 'Failed to load usage');
      setData(body);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load usage');
    }
  }, [range]);

  useEffect(() => { load(); }, [load]);

  const totalTokens = data
    ? data.byAgent.reduce((sum, a) => sum + a.inputTokens + a.outputTokens, 0)
    : 0;
  const agentsWithActivity = data ? data.byAgent.filter(a => a.calls > 0) : [];

  return (
    <div className="mx-auto max-w-5xl space-y-6">
      <div>
        <h1 className="flex items-center gap-2 text-2xl font-semibold tracking-tight text-neutral-900 dark:text-white">
          <DollarSign className="h-5 w-5" />
          Costs
        </h1>
        <p className="mt-1 text-sm text-neutral-500 dark:text-neutral-400">
          Claude API token usage and spend, per bot (Pepe, Santi, Angeles, Abu) and the lead-extraction job.
        </p>
      </div>

      <Card className="flex flex-wrap items-center gap-4">
        <div className="flex items-center gap-2">
          <span className="text-xs font-medium text-neutral-500 dark:text-neutral-400">
            <Calendar className="mr-1 inline h-3.5 w-3.5" />
            Range
          </span>
          <div className="flex gap-1 rounded-xl bg-neutral-100 p-1 dark:bg-neutral-800">
            {RANGES.map(r => (
              <button
                key={r.value}
                onClick={() => setRange(r.value)}
                className={cn(
                  'rounded-lg px-2.5 py-1 text-xs font-medium transition',
                  range === r.value
                    ? 'bg-white text-neutral-900 shadow-sm dark:bg-neutral-700 dark:text-white'
                    : 'text-neutral-500 dark:text-neutral-400'
                )}
              >
                {r.label}
              </button>
            ))}
          </div>
        </div>
      </Card>

      {error && <p className="text-sm text-red-600 dark:text-red-400">{error}</p>}

      <section className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        <KpiCard
          label="Total spend"
          value={data ? formatUsd(data.totalCostUsd) : '—'}
          icon={DollarSign}
          tooltip="Estimated USD cost across all agents, based on published Claude API list pricing for the model each call used."
        />
        <KpiCard
          label="API calls"
          value={data?.totalCalls ?? '—'}
          icon={Hash}
        />
        <KpiCard
          label="Total tokens"
          value={data ? totalTokens : '—'}
          icon={Zap}
          tooltip="Input + output tokens across all calls (cache read/write tokens shown separately per agent below)."
        />
      </section>

      <Card className="space-y-3">
        <h3 className="text-sm font-semibold text-neutral-900 dark:text-white">Spend over time</h3>
        {data === null ? (
          <p className="py-10 text-center text-sm text-neutral-400">Loading…</p>
        ) : data.byDay.length === 0 ? (
          <p className="py-10 text-center text-sm text-neutral-400">No API usage recorded in this period.</p>
        ) : (
          <ResponsiveContainer width="100%" height={260}>
            <BarChart data={data.byDay} margin={{ top: 4, right: 8, left: -16, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" className="stroke-neutral-100 dark:stroke-neutral-800" />
              <XAxis
                dataKey="date"
                tick={{ fontSize: 12 }}
                stroke="currentColor"
                className="text-neutral-400"
                tickFormatter={formatDate}
              />
              <YAxis
                tick={{ fontSize: 12 }}
                stroke="currentColor"
                className="text-neutral-400"
                tickFormatter={(v: number) => formatUsd(v)}
              />
              <Tooltip
                contentStyle={{ borderRadius: 12, border: '1px solid #e5e5e5', fontSize: 13 }}
                labelFormatter={(label: unknown) => typeof label === 'string' ? formatDate(label) : String(label)}
                formatter={(value: unknown) => [formatUsd(Number(value ?? 0)), 'Spend']}
              />
              <Bar dataKey="costUsd" name="Spend" fill="#6366f1" radius={[6, 6, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        )}
      </Card>

      <Card className="space-y-3">
        <h3 className="text-sm font-semibold text-neutral-900 dark:text-white">By agent</h3>
        {data === null ? (
          <p className="text-sm text-neutral-400">Loading…</p>
        ) : agentsWithActivity.length === 0 ? (
          <p className="text-sm text-neutral-400">No API usage recorded in this period.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-neutral-100 text-left text-xs text-neutral-500 dark:border-neutral-800 dark:text-neutral-400">
                  <th className="pb-2 font-medium">Agent</th>
                  <th className="pb-2 font-medium">Calls</th>
                  <th className="pb-2 font-medium">Input tokens</th>
                  <th className="pb-2 font-medium">Output tokens</th>
                  <th className="pb-2 font-medium">Cache write</th>
                  <th className="pb-2 font-medium">Cache read</th>
                  <th className="pb-2 font-medium">Spend</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-neutral-50 dark:divide-neutral-800">
                {agentsWithActivity
                  .slice()
                  .sort((a, b) => b.costUsd - a.costUsd)
                  .map(row => (
                    <tr key={row.agent}>
                      <td className="py-2.5">
                        <span className="flex items-center gap-2 font-medium text-neutral-900 dark:text-white">
                          <span
                            className="h-2 w-2 rounded-full"
                            style={{ backgroundColor: AGENT_COLORS[row.agent] }}
                          />
                          {AGENT_LABELS[row.agent]}
                        </span>
                      </td>
                      <td className="py-2.5 text-neutral-700 dark:text-neutral-300">{row.calls.toLocaleString()}</td>
                      <td className="py-2.5 text-neutral-700 dark:text-neutral-300">{row.inputTokens.toLocaleString()}</td>
                      <td className="py-2.5 text-neutral-700 dark:text-neutral-300">{row.outputTokens.toLocaleString()}</td>
                      <td className="py-2.5 text-neutral-700 dark:text-neutral-300">{row.cacheCreationTokens.toLocaleString()}</td>
                      <td className="py-2.5 text-neutral-700 dark:text-neutral-300">{row.cacheReadTokens.toLocaleString()}</td>
                      <td className="py-2.5 font-medium text-neutral-900 dark:text-white">{formatUsd(row.costUsd)}</td>
                    </tr>
                  ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>
    </div>
  );
}
