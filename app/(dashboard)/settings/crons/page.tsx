'use client';

import { useEffect, useState, useCallback } from 'react';
import { Card } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { Badge } from '@/components/ui/Badge';
import { Skeleton } from '@/components/ui/Skeleton';
import { SettingsBackLink } from '@/components/dashboard/SettingsBackLink';

interface CronRow {
  id: string;
  path: string;
  name: string;
  schedule: string;
  description: string;
  enabled: boolean;
  updated_at: string;
}

const DAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

/** Only needs to cover the schedules actually used in vercel.json (hourly,
 * every-N-minutes, daily HH:00, weekly on a day at HH:00) -- falls back to
 * the raw expression for anything else rather than guessing wrong. */
function humanizeSchedule(expr: string): string {
  const parts = expr.trim().split(/\s+/);
  if (parts.length !== 5) return expr;
  const [min, hour, dom, month, dow] = parts;

  if (min.startsWith('*/') && hour === '*' && dom === '*' && month === '*' && dow === '*') {
    return `Every ${min.slice(2)} minutes`;
  }
  if (min === '0' && hour === '*' && dom === '*' && month === '*' && dow === '*') {
    return 'Every hour, on the hour';
  }
  if (/^\d+$/.test(min) && /^\d+$/.test(hour) && dom === '*' && month === '*') {
    const time = `${hour.padStart(2, '0')}:${min.padStart(2, '0')} UTC`;
    if (dow === '*') return `Daily at ${time}`;
    if (/^\d+$/.test(dow)) return `${DAYS[Number(dow) % 7]}s at ${time}`;
  }
  return expr;
}

export default function CronsPage() {
  const [crons, setCrons] = useState<CronRow[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pendingId, setPendingId] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const res = await fetch('/api/admin/crons');
      const body = await res.json();
      if (!res.ok) throw new Error(body.error ?? 'Failed to load crons.');
      setCrons(body.crons ?? []);
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load crons.');
      setCrons([]);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  async function toggleEnabled(cron: CronRow) {
    setPendingId(cron.id);
    try {
      const res = await fetch(`/api/admin/crons/${cron.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ enabled: !cron.enabled }),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        setError(body.error ?? 'Failed to update cron.');
        return;
      }
      await load();
    } finally {
      setPendingId(null);
    }
  }

  return (
    <div className="mx-auto max-w-4xl space-y-6">
      <div>
        <SettingsBackLink />
        <h1 className="text-2xl font-semibold tracking-tight text-neutral-900 dark:text-white">Crons</h1>
        <p className="mt-1 text-sm text-neutral-500 dark:text-neutral-400">
          Every scheduled job Vercel runs for this app. Disabling one here doesn&apos;t stop Vercel from
          triggering it — the job still fires on schedule, but its route does nothing when disabled.
        </p>
      </div>

      {error && <p className="text-sm text-red-600 dark:text-red-400">{error}</p>}

      <Card className="p-0">
        {crons === null ? (
          <div className="space-y-2 p-5">
            <Skeleton className="h-10 w-full" />
            <Skeleton className="h-10 w-full" />
            <Skeleton className="h-10 w-full" />
          </div>
        ) : crons.length === 0 ? (
          <p className="p-6 text-center text-sm text-neutral-400">No crons found.</p>
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-neutral-200 text-left text-xs text-neutral-400 dark:border-neutral-800">
                <th className="px-5 py-3 font-medium">Name</th>
                <th className="px-5 py-3 font-medium">Schedule</th>
                <th className="px-5 py-3 font-medium">What it does</th>
                <th className="px-5 py-3 font-medium">Status</th>
                <th className="px-5 py-3 font-medium text-right">Actions</th>
              </tr>
            </thead>
            <tbody>
              {crons.map(cron => (
                <tr key={cron.id} className="border-b border-neutral-100 last:border-0 dark:border-neutral-800">
                  <td className="px-5 py-3 align-top font-medium text-neutral-900 dark:text-white">
                    {cron.name}
                    <div className="mt-0.5 font-mono text-[11px] font-normal text-neutral-400">{cron.path}</div>
                  </td>
                  <td className="px-5 py-3 align-top">
                    <div className="text-neutral-700 dark:text-neutral-300">{humanizeSchedule(cron.schedule)}</div>
                    <div className="mt-0.5 font-mono text-[11px] text-neutral-400">{cron.schedule}</div>
                  </td>
                  <td className="px-5 py-3 align-top text-neutral-500 dark:text-neutral-400">{cron.description}</td>
                  <td className="px-5 py-3 align-top">
                    <Badge tone={cron.enabled ? 'positive' : 'negative'}>
                      {cron.enabled ? 'Enabled' : 'Disabled'}
                    </Badge>
                  </td>
                  <td className="px-5 py-3 align-top">
                    <div className="flex justify-end">
                      <Button
                        variant="secondary"
                        onClick={() => toggleEnabled(cron)}
                        disabled={pendingId === cron.id}
                      >
                        {cron.enabled ? 'Disable' : 'Enable'}
                      </Button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </Card>
    </div>
  );
}
