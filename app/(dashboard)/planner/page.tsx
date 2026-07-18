'use client';

import { useCallback, useEffect, useState } from 'react';
import { WeekNav, currentWeekMonday } from '@/components/planner/WeekNav';
import { PostCard } from '@/components/planner/PostCard';
import { PostEditor } from '@/components/planner/PostEditor';
import { Skeleton } from '@/components/ui/Skeleton';
import type { MarketingPost } from '@/lib/marketing-plan';

const DAY_LABELS = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];

function addDays(dateStr: string, days: number): string {
  const d = new Date(dateStr + 'T00:00:00Z');
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().split('T')[0];
}

export default function PlannerPage() {
  const [weekStart, setWeekStart] = useState(currentWeekMonday);
  const [posts, setPosts] = useState<MarketingPost[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [selected, setSelected] = useState<MarketingPost | null>(null);

  const load = useCallback(async () => {
    setPosts(null);
    try {
      const res = await fetch(`/api/dashboard/plan?week_start=${weekStart}`);
      const body = await res.json();
      if (!res.ok) throw new Error(body.error ?? 'Failed to load the plan.');
      setPosts(body.posts ?? []);
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load the plan.');
      setPosts([]);
    }
  }, [weekStart]);

  useEffect(() => {
    load();
  }, [load]);

  const days = Array.from({ length: 7 }, (_, i) => addDays(weekStart, i));

  return (
    <div className="mx-auto max-w-7xl space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight text-neutral-900 dark:text-white">Planner</h1>
          <p className="mt-1 text-sm text-neutral-500 dark:text-neutral-400">
            This week's scheduled posts across LinkedIn, Facebook, and Instagram.
          </p>
        </div>
        <WeekNav weekStart={weekStart} onChange={setWeekStart} />
      </div>

      {error && <p className="text-sm text-red-600 dark:text-red-400">{error}</p>}

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-7">
        {days.map((date, i) => {
          const dayPosts = posts?.filter(p => p.scheduled_date === date) ?? [];
          return (
            <div key={date} className="space-y-2">
              <div className="px-1">
                <p className="text-xs font-semibold uppercase tracking-wide text-neutral-400">{DAY_LABELS[i]}</p>
                <p className="text-sm text-neutral-500">
                  {new Date(date + 'T00:00:00Z').toLocaleDateString('en-US', { month: 'short', day: 'numeric', timeZone: 'UTC' })}
                </p>
              </div>
              <div className="space-y-2">
                {posts === null ? (
                  <>
                    <Skeleton className="h-20 w-full" />
                    <Skeleton className="h-20 w-full" />
                  </>
                ) : dayPosts.length === 0 ? (
                  <p className="rounded-xl border border-dashed border-neutral-200 p-3 text-center text-xs text-neutral-300 dark:border-neutral-800 dark:text-neutral-600">
                    No posts
                  </p>
                ) : (
                  dayPosts.map(post => <PostCard key={post.id} post={post} onClick={() => setSelected(post)} />)
                )}
              </div>
            </div>
          );
        })}
      </div>

      <PostEditor
        post={selected}
        onClose={() => setSelected(null)}
        onSaved={() => {
          setSelected(null);
          load();
        }}
        onPostUpdated={updated => {
          setPosts(prev => prev?.map(p => (p.id === updated.id ? updated : p)) ?? prev);
          setSelected(updated);
        }}
      />
    </div>
  );
}
