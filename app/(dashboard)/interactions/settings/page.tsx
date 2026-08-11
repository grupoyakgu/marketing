'use client';

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { ArrowLeft, Plus, Trash2 } from 'lucide-react';
import { Card } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { Badge } from '@/components/ui/Badge';
import { PlatformBadge } from '@/components/ui/PlatformBadge';

type Platform = 'linkedin' | 'facebook' | 'instagram';

interface Topic {
  id: string;
  topic: string;
  added_by: 'user' | 'pepe';
  created_at: string;
}

const PLATFORMS: { value: Platform; label: string }[] = [
  { value: 'linkedin', label: 'LinkedIn' },
  { value: 'facebook', label: 'Facebook' },
  { value: 'instagram', label: 'Instagram' },
];

export default function InteractionsSettingsPage() {
  const [dailyCounts, setDailyCounts] = useState<Record<Platform, number> | null>(null);
  const [countInputs, setCountInputs] = useState<Record<Platform, string>>({ linkedin: '', facebook: '', instagram: '' });
  const [topics, setTopics] = useState<Topic[] | null>(null);
  const [newTopic, setNewTopic] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [savingPlatform, setSavingPlatform] = useState<Platform | null>(null);
  const [addingTopic, setAddingTopic] = useState(false);
  const [removingId, setRemovingId] = useState<string | null>(null);

  const load = useCallback(async () => {
    setError(null);
    try {
      const res = await fetch('/api/dashboard/interactions/settings');
      const body = await res.json();
      if (!res.ok) throw new Error(body.error ?? 'Failed to load settings');
      setDailyCounts(body.dailyCounts);
      setCountInputs({
        linkedin: String(body.dailyCounts.linkedin),
        facebook: String(body.dailyCounts.facebook),
        instagram: String(body.dailyCounts.instagram),
      });
      setTopics(body.topics);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load settings');
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  async function saveDailyCount(platform: Platform) {
    const count = Number(countInputs[platform]);
    if (!Number.isInteger(count) || count < 1 || count > 10) {
      setError('Daily count must be a whole number between 1 and 10.');
      return;
    }
    setSavingPlatform(platform);
    setError(null);
    try {
      const res = await fetch('/api/dashboard/interactions/settings', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ platform, dailyCount: count }),
      });
      const body = await res.json();
      if (!res.ok) throw new Error(body.error ?? 'Failed to update daily count');
      setDailyCounts(prev => prev && { ...prev, [platform]: body.dailyCount });
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to update daily count');
    } finally {
      setSavingPlatform(null);
    }
  }

  async function addTopic() {
    if (!newTopic.trim()) return;
    setAddingTopic(true);
    setError(null);
    try {
      const res = await fetch('/api/dashboard/interactions/topics', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ topic: newTopic }),
      });
      const body = await res.json();
      if (!res.ok) throw new Error(body.error ?? 'Failed to add topic');
      setNewTopic('');
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to add topic');
    } finally {
      setAddingTopic(false);
    }
  }

  async function removeTopic(id: string) {
    setRemovingId(id);
    setError(null);
    try {
      const res = await fetch(`/api/dashboard/interactions/topics/${id}`, { method: 'DELETE' });
      if (!res.ok) throw new Error((await res.json()).error ?? 'Failed to remove topic');
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to remove topic');
    } finally {
      setRemovingId(null);
    }
  }

  return (
    <div className="mx-auto max-w-2xl space-y-6">
      <div>
        <Link
          href="/interactions"
          className="mb-2 inline-flex items-center gap-1.5 text-xs text-neutral-400 transition hover:text-neutral-600 dark:hover:text-neutral-300"
        >
          <ArrowLeft className="h-3.5 w-3.5" /> Back to Interactions
        </Link>
        <h1 className="text-2xl font-semibold tracking-tight text-neutral-900 dark:text-white">
          Interactions settings
        </h1>
        <p className="mt-1 text-sm text-neutral-500 dark:text-neutral-400">
          How many posts to keep active per platform, and which topics Pepe looks for — set by you
          or by Pepe himself.
        </p>
      </div>

      {error && <p className="text-sm text-red-600 dark:text-red-400">{error}</p>}

      <Card className="space-y-3">
        <h2 className="text-sm font-semibold text-neutral-900 dark:text-white">Daily count per platform</h2>
        <p className="text-xs text-neutral-500 dark:text-neutral-400">
          How many active posts each platform keeps on the Interactions page. Removing a post below
          this number gets a replacement found automatically.
        </p>
        <div className="space-y-2">
          {PLATFORMS.map(({ value, label }) => (
            <div key={value} className="flex items-center gap-3">
              <div className="flex w-28 shrink-0 items-center gap-2">
                <PlatformBadge platform={value} size="md" />
                <span className="text-sm text-neutral-900 dark:text-white">{label}</span>
              </div>
              <input
                type="number"
                min={1}
                max={10}
                value={countInputs[value]}
                onChange={e => setCountInputs(prev => ({ ...prev, [value]: e.target.value }))}
                disabled={dailyCounts === null || savingPlatform === value}
                className="w-20 rounded-xl border border-neutral-200 bg-neutral-50 px-3 py-2 text-sm outline-none focus:border-neutral-400 disabled:opacity-60 dark:border-neutral-700 dark:bg-neutral-800 dark:text-white"
              />
              <Button
                variant="secondary"
                onClick={() => saveDailyCount(value)}
                disabled={
                  dailyCounts === null ||
                  savingPlatform === value ||
                  countInputs[value] === String(dailyCounts?.[value])
                }
              >
                {savingPlatform === value ? 'Saving…' : 'Save'}
              </Button>
            </div>
          ))}
        </div>
      </Card>

      <Card className="space-y-3">
        <h2 className="text-sm font-semibold text-neutral-900 dark:text-white">Topics</h2>
        <div className="flex flex-wrap items-center gap-2">
          <input
            type="text"
            value={newTopic}
            onChange={e => setNewTopic(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && addTopic()}
            placeholder="Add a topic, e.g. Sevilla real estate market"
            disabled={addingTopic}
            className="min-w-[200px] flex-1 rounded-xl border border-neutral-200 bg-neutral-50 px-3 py-2 text-sm outline-none focus:border-neutral-400 disabled:opacity-60 dark:border-neutral-700 dark:bg-neutral-800 dark:text-white"
          />
          <Button onClick={addTopic} disabled={addingTopic || !newTopic.trim()} variant="secondary">
            <Plus className="h-4 w-4" />
            {addingTopic ? 'Adding…' : 'Add'}
          </Button>
        </div>

        {topics === null ? (
          <p className="text-sm text-neutral-400">Loading…</p>
        ) : topics.length === 0 ? (
          <p className="text-sm text-neutral-500 dark:text-neutral-400">
            No topics yet — add one above, or ask Pepe to add one.
          </p>
        ) : (
          <div className="space-y-2">
            {topics.map(t => (
              <div
                key={t.id}
                className="flex items-center justify-between gap-3 rounded-xl border border-neutral-100 px-3 py-2 dark:border-neutral-800"
              >
                <div className="flex items-center gap-2">
                  <span className="text-sm text-neutral-900 dark:text-white">{t.topic}</span>
                  <Badge tone={t.added_by === 'pepe' ? 'positive' : 'neutral'}>
                    {t.added_by === 'pepe' ? 'Added by Pepe' : 'Added by you'}
                  </Badge>
                </div>
                <button
                  onClick={() => removeTopic(t.id)}
                  disabled={removingId === t.id}
                  title="Remove topic"
                  className="rounded-lg p-1.5 text-neutral-400 transition hover:bg-red-50 hover:text-red-600 disabled:opacity-50 dark:hover:bg-red-950"
                >
                  <Trash2 className="h-3.5 w-3.5" />
                </button>
              </div>
            ))}
          </div>
        )}
      </Card>
    </div>
  );
}
