'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Card } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { RefreshCw } from 'lucide-react';

interface RefreshResult {
  refreshed: string[];
  failed: string[];
}

export function RefreshHashtagsCard() {
  const router = useRouter();
  const [running, setRunning] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<RefreshResult | null>(null);

  async function handleRefresh() {
    setRunning(true);
    setError(null);
    try {
      const res = await fetch('/api/dashboard/hashtags/refresh', { method: 'POST' });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(body.error ?? 'Refresh failed.');
      setResult(body.result);
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Refresh failed.');
    } finally {
      setRunning(false);
    }
  }

  return (
    <Card className="flex flex-wrap items-center justify-between gap-3">
      <p className="max-w-md text-xs text-neutral-500 dark:text-neutral-400">
        Pulls fresh stats for every tracked hashtag. Discovering a brand-new hashtag counts against
        Meta&apos;s limit of 30 per rolling 7 days — hashtags already tracked don&apos;t.
      </p>
      <Button onClick={handleRefresh} disabled={running} variant="secondary">
        <RefreshCw className={`h-4 w-4 ${running ? 'animate-spin' : ''}`} />
        {running ? 'Refreshing…' : 'Refresh now'}
      </Button>
      {error && <p className="w-full text-sm text-red-600 dark:text-red-400">{error}</p>}
      {result && !error && (
        <p className="w-full text-xs text-neutral-500 dark:text-neutral-400">
          Refreshed: {result.refreshed.join(', ') || 'none'}
          {result.failed.length > 0 && ` · Failed: ${result.failed.join(', ')}`}
        </p>
      )}
    </Card>
  );
}
