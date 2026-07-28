'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Card } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { Plus } from 'lucide-react';

export function AddHashtagCard() {
  const router = useRouter();
  const [tag, setTag] = useState('');
  const [adding, setAdding] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleAdd() {
    if (!tag.trim()) return;
    setAdding(true);
    setError(null);
    try {
      const res = await fetch('/api/dashboard/hashtags', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ tag }),
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(body.error ?? 'Failed to add hashtag.');
      setTag('');
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to add hashtag.');
    } finally {
      setAdding(false);
    }
  }

  return (
    <Card className="flex flex-wrap items-center gap-2">
      <input
        type="text"
        value={tag}
        onChange={e => setTag(e.target.value)}
        onKeyDown={e => e.key === 'Enter' && handleAdd()}
        placeholder="Add a hashtag to track (no # needed)"
        disabled={adding}
        className="min-w-[200px] flex-1 rounded-xl border border-neutral-200 bg-neutral-50 px-3 py-2 text-sm outline-none focus:border-neutral-400 disabled:opacity-60 dark:border-neutral-700 dark:bg-neutral-800 dark:text-white"
      />
      <Button onClick={handleAdd} disabled={adding || !tag.trim()} variant="secondary">
        <Plus className="h-4 w-4" />
        {adding ? 'Adding…' : 'Add'}
      </Button>
      {error && <p className="w-full text-sm text-red-600 dark:text-red-400">{error}</p>}
    </Card>
  );
}
