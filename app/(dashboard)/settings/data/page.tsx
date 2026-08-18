'use client';

import { useEffect, useState, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { Card } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { Skeleton } from '@/components/ui/Skeleton';
import { SettingsBackLink } from '@/components/dashboard/SettingsBackLink';
import { RefreshCw, Users2, FileStack, Clock3, Link2 } from 'lucide-react';

interface RefreshStatus {
  refreshedAt: string | null;
  durationMs: number | null;
  postsRefreshed: number | null;
  accountsRefreshed: number | null;
}

function formatDuration(ms: number): string {
  const seconds = ms / 1000;
  return seconds < 10 ? `${seconds.toFixed(1)}s` : `${Math.round(seconds)}s`;
}

function formatAbsolute(iso: string): string {
  return new Date(iso).toLocaleString(undefined, {
    dateStyle: 'medium',
    timeStyle: 'short',
  });
}

export default function DataSyncPage() {
  const router = useRouter();
  const [status, setStatus] = useState<RefreshStatus | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [backfilling, setBackfilling] = useState(false);
  const [backfillResult, setBackfillResult] = useState<{ checked: number; updated: number; failed: number } | null>(null);
  const [backfillError, setBackfillError] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const res = await fetch('/api/dashboard/refresh');
      const body = await res.json();
      if (!res.ok) throw new Error(body.error ?? 'Failed to load refresh status.');
      setStatus(body.status);
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load refresh status.');
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  async function handleRefresh() {
    setRefreshing(true);
    setError(null);
    try {
      const res = await fetch('/api/dashboard/refresh', { method: 'POST' });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(body.error ?? 'Refresh failed.');
      setStatus({
        refreshedAt: new Date().toISOString(),
        durationMs: body.result.durationMs,
        postsRefreshed: body.result.postsRefreshed,
        accountsRefreshed: body.result.accountsRefreshed,
      });
      // Invalidates the Next.js Router Cache so Overview (and any other
      // dashboard page) re-fetches instead of serving the RSC payload it
      // cached client-side before this refresh ran.
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Refresh failed.');
    } finally {
      setRefreshing(false);
    }
  }

  async function handleBackfillInstagramLinks() {
    setBackfilling(true);
    setBackfillError(null);
    try {
      const res = await fetch('/api/admin/backfill-instagram-permalinks', { method: 'POST' });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(body.error ?? 'Backfill failed.');
      setBackfillResult({ checked: body.checked, updated: body.updated, failed: body.failed });
    } catch (err) {
      setBackfillError(err instanceof Error ? err.message : 'Backfill failed.');
    } finally {
      setBackfilling(false);
    }
  }

  const estimate = status?.durationMs ? formatDuration(status.durationMs) : '10-30s';

  return (
    <div className="mx-auto max-w-2xl space-y-6">
      <div>
        <SettingsBackLink />
        <h1 className="text-2xl font-semibold tracking-tight text-neutral-900 dark:text-white">Data Sync</h1>
        <p className="mt-1 text-sm text-neutral-500 dark:text-neutral-400">
          Follower counts and post engagement are fetched from LinkedIn, Facebook, and Instagram once a day
          and cached, so the dashboard loads instantly. Refresh manually here if you need the latest numbers
          right now.
        </p>
      </div>

      <Card>
        {status === null ? (
          <div className="space-y-3">
            <Skeleton className="h-5 w-48" />
            <Skeleton className="h-5 w-32" />
          </div>
        ) : (
          <div className="space-y-4">
            <div className="flex items-center gap-2 text-sm text-neutral-700 dark:text-neutral-300">
              <Clock3 className="h-4 w-4 text-neutral-400" />
              {status.refreshedAt ? (
                <span>Last refreshed {formatAbsolute(status.refreshedAt)}</span>
              ) : (
                <span>Never refreshed yet</span>
              )}
            </div>
            {status.durationMs !== null && (
              <div className="flex flex-wrap gap-4 text-xs text-neutral-500 dark:text-neutral-400">
                <span className="flex items-center gap-1.5">
                  <RefreshCw className="h-3.5 w-3.5" />
                  Took {formatDuration(status.durationMs)}
                </span>
                <span className="flex items-center gap-1.5">
                  <Users2 className="h-3.5 w-3.5" />
                  {status.accountsRefreshed ?? 0} account{status.accountsRefreshed === 1 ? '' : 's'}
                </span>
                <span className="flex items-center gap-1.5">
                  <FileStack className="h-3.5 w-3.5" />
                  {status.postsRefreshed ?? 0} post{status.postsRefreshed === 1 ? '' : 's'}
                </span>
              </div>
            )}

            <Button onClick={handleRefresh} disabled={refreshing}>
              <RefreshCw className={`h-4 w-4 ${refreshing ? 'animate-spin' : ''}`} />
              {refreshing ? `Refreshing… usually takes ~${estimate}` : 'Refresh now'}
            </Button>

            {error && <p className="text-sm text-red-600 dark:text-red-400">{error}</p>}
          </div>
        )}
      </Card>

      <Card>
        <div className="space-y-4">
          <div>
            <h2 className="text-sm font-medium text-neutral-900 dark:text-white">Fix Instagram post links</h2>
            <p className="mt-1 text-sm text-neutral-500 dark:text-neutral-400">
              Posts published before a recent fix have a broken "View post" link — it was built from the
              post&apos;s internal ID instead of Instagram&apos;s own permalink. This re-fetches the real
              link for every posted Instagram entry and updates it in place. Safe to run more than once.
            </p>
          </div>

          <Button onClick={handleBackfillInstagramLinks} disabled={backfilling}>
            <Link2 className={`h-4 w-4 ${backfilling ? 'animate-pulse' : ''}`} />
            {backfilling ? 'Fixing links…' : 'Fix Instagram links'}
          </Button>

          {backfillResult && (
            <p className="text-sm text-neutral-600 dark:text-neutral-300">
              Checked {backfillResult.checked}, fixed {backfillResult.updated}
              {backfillResult.failed > 0 ? `, ${backfillResult.failed} failed (see server logs)` : ''}.
            </p>
          )}
          {backfillError && <p className="text-sm text-red-600 dark:text-red-400">{backfillError}</p>}
        </div>
      </Card>
    </div>
  );
}
