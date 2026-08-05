'use client';

import { useMemo, useState } from 'react';
import { Trophy, ExternalLink, ArrowUp, ArrowDown, ArrowUpDown } from 'lucide-react';
import { PlatformBadge } from '@/components/ui/PlatformBadge';
import { cn } from '@/lib/cn';
import type { RankedPostPerformance } from '@/lib/engagement';

type SortKey = 'score' | 'likes' | 'comments' | 'shares' | 'impressions' | 'reach' | 'engagementRate';

const COLUMNS: { key: SortKey; label: string }[] = [
  { key: 'likes', label: 'Likes' },
  { key: 'comments', label: 'Comments' },
  { key: 'shares', label: 'Shares' },
  { key: 'impressions', label: 'Impressions' },
  { key: 'reach', label: 'Reach' },
  { key: 'engagementRate', label: 'Eng. rate' },
  { key: 'score', label: 'Score' },
];

function formatDate(dateStr: string): string {
  return new Date(dateStr + 'T00:00:00Z').toLocaleDateString('en-US', { month: 'short', day: 'numeric', timeZone: 'UTC' });
}

export function PerformanceTable({ posts }: { posts: RankedPostPerformance[] }) {
  const [sortKey, setSortKey] = useState<SortKey>('score');
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('desc');

  const sorted = useMemo(() => {
    const copy = [...posts];
    copy.sort((a, b) => (sortDir === 'desc' ? b[sortKey] - a[sortKey] : a[sortKey] - b[sortKey]));
    return copy;
  }, [posts, sortKey, sortDir]);

  function handleSort(key: SortKey) {
    if (key === sortKey) {
      setSortDir(dir => (dir === 'desc' ? 'asc' : 'desc'));
    } else {
      setSortKey(key);
      setSortDir('desc');
    }
  }

  if (posts.length === 0) {
    return (
      <p className="p-6 text-center text-sm text-neutral-400 dark:text-neutral-500">
        No published posts with engagement data yet.
      </p>
    );
  }

  return (
    <div className="overflow-x-auto">
      <table className="w-full text-left text-sm">
        <thead>
          <tr className="border-b border-neutral-200 text-xs uppercase tracking-wide text-neutral-400 dark:border-neutral-800">
            <th className="px-4 py-3 font-medium">#</th>
            <th className="px-2 py-3 font-medium">Post</th>
            {COLUMNS.map(col => (
              <th key={col.key} className="px-2 py-3 text-right font-medium">
                <button
                  type="button"
                  onClick={() => handleSort(col.key)}
                  className="inline-flex flex-row-reverse items-center gap-1 hover:text-neutral-600 dark:hover:text-neutral-300"
                >
                  {col.label}
                  {sortKey === col.key ? (
                    sortDir === 'desc' ? <ArrowDown className="h-3 w-3" /> : <ArrowUp className="h-3 w-3" />
                  ) : (
                    <ArrowUpDown className="h-3 w-3 opacity-30" />
                  )}
                </button>
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {sorted.map((p, i) => (
            <tr
              key={p.postId}
              className="border-b border-neutral-100 last:border-0 hover:bg-neutral-50 dark:border-neutral-800/60 dark:hover:bg-neutral-800/40"
            >
              <td className="px-4 py-3 align-top text-neutral-400">
                {sortKey === 'score' && sortDir === 'desc' && i === 0 ? (
                  <Trophy className="h-4 w-4 text-amber-500" />
                ) : (
                  i + 1
                )}
              </td>
              <td className="max-w-xs px-2 py-3 align-top">
                <div className="flex items-center gap-1.5">
                  <PlatformBadge platform={p.platform} />
                  <span className="text-xs text-neutral-400">{formatDate(p.scheduledDate)}</span>
                  {p.postUrl && (
                    <a
                      href={p.postUrl}
                      target="_blank"
                      rel="noreferrer"
                      title="View live"
                      className="text-neutral-300 hover:text-neutral-500 dark:hover:text-neutral-300"
                    >
                      <ExternalLink className="h-3 w-3" />
                    </a>
                  )}
                </div>
                <p className={cn('mt-1 truncate text-xs text-neutral-600 dark:text-neutral-300')}>{p.contentPreview}</p>
              </td>
              <td className="px-2 py-3 text-right align-top tabular-nums text-neutral-700 dark:text-neutral-300">{p.likes}</td>
              <td className="px-2 py-3 text-right align-top tabular-nums text-neutral-700 dark:text-neutral-300">{p.comments}</td>
              <td className="px-2 py-3 text-right align-top tabular-nums text-neutral-700 dark:text-neutral-300">{p.shares}</td>
              <td className="px-2 py-3 text-right align-top tabular-nums text-neutral-700 dark:text-neutral-300">{p.impressions}</td>
              <td className="px-2 py-3 text-right align-top tabular-nums text-neutral-700 dark:text-neutral-300">{p.reach}</td>
              <td className="px-2 py-3 text-right align-top tabular-nums text-neutral-700 dark:text-neutral-300">{p.engagementRate.toFixed(1)}%</td>
              <td className="px-4 py-3 text-right align-top tabular-nums font-semibold text-neutral-900 dark:text-white">{p.score.toFixed(1)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
