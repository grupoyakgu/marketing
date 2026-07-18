'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Card } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { MessageSquare } from 'lucide-react';

interface CheckResult {
  comments: number;
  thankYou: number;
  shoutouts: number;
  skipped?: string;
}

export function CheckCommentsCard() {
  const router = useRouter();
  const [running, setRunning] = useState(false);
  const [result, setResult] = useState<CheckResult | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function handleRun() {
    setRunning(true);
    setError(null);
    try {
      const res = await fetch('/api/dashboard/check-comments', { method: 'POST' });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(body.error ?? 'Check failed.');
      setResult(body.result);
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Check failed.');
    } finally {
      setRunning(false);
    }
  }

  return (
    <Card className="space-y-3">
      <div className="flex items-center gap-2">
        <MessageSquare className="h-4 w-4 text-neutral-400" />
        <h2 className="text-sm font-semibold text-neutral-900 dark:text-white">Comment Check</h2>
      </div>
      <p className="text-xs text-neutral-500 dark:text-neutral-400">
        Runs the same check Pepe does hourly: fetches new comments across LinkedIn, Facebook, and
        Instagram, replies to them, and reacts to like milestones. Can take a while — it also asks
        Pepe to draft each reply. See the Comments page for the results.
      </p>

      <Button onClick={handleRun} disabled={running}>
        <MessageSquare className={`h-4 w-4 ${running ? 'animate-pulse' : ''}`} />
        {running ? 'Checking… this can take a minute or two' : 'Check now'}
      </Button>

      {result && !error && (
        <p className="text-xs text-neutral-500 dark:text-neutral-400">
          {result.skipped
            ? `Skipped: ${result.skipped}`
            : `${result.comments} comment${result.comments === 1 ? '' : 's'} handled, ${result.thankYou} thank-you comment${result.thankYou === 1 ? '' : 's'}, ${result.shoutouts} shoutout post${result.shoutouts === 1 ? '' : 's'} drafted.`}
        </p>
      )}
      {error && <p className="text-sm text-red-600 dark:text-red-400">{error}</p>}
    </Card>
  );
}
