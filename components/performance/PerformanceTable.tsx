'use client';

import { useMemo, useState } from 'react';
import { Trophy, ExternalLink, ArrowUp, ArrowDown, ArrowUpDown, Info } from 'lucide-react';
import { PlatformBadge } from '@/components/ui/PlatformBadge';
import { cn } from '@/lib/cn';
import type { RankedPostPerformance } from '@/lib/engagement';

type SortKey = 'score' | 'likes' | 'comments' | 'shares' | 'impressions' | 'reach' | 'engagementRate';
type PlatformFilter = 'all' | 'linkedin' | 'instagram' | 'facebook';
type DateRange = 'all' | '30' | '60' | '90';

const COLUMNS: { key: SortKey; label: string }[] = [
  { key: 'likes', label: 'Likes' },
  { key: 'comments', label: 'Comments' },
  { key: 'shares', label: 'Shares' },
  { key: 'impressions', label: 'Impressions' },
  { key: 'reach', label: 'Reach' },
  { key: 'engagementRate', label: 'Eng. rate' },
  { key: 'score', label: 'Score' },
];

const PLATFORM_FILTERS: { value: PlatformFilter; label: string }[] = [
  { value: 'all', label: 'All' },
  { value: 'linkedin', label: 'LinkedIn' },
  { value: 'instagram', label: 'Instagram' },
  { value: 'facebook', label: 'Facebook' },
];

const DATE_RANGES: { value: DateRange; label: string }[] = [
  { value: 'all', label: 'All time' },
  { value: '30', label: 'Last 30 days' },
  { value: '60', label: 'Last 60 days' },
  { value: '90', label: 'Last 90 days' },
];

const SCORE_TOOLTIP =
  'Score = min-max normalized composite: Comments 25%, Likes 20%, Shares 20%, Eng. rate 20%, Reach 15%. Impressions excluded (unavailable for Facebook).';

function formatDate(dateStr: string): string {
  return new Date(dateStr + 'T00:00:00Z').toLocaleDateString('en-US', { month: 'short', day: 'numeric', timeZone: 'UTC' });
}

function isoDateMinus(days: number): string {
  const d = new Date();
  d.setDate(d.getDate() - days);
  return d.toISOString().split('T')[0];
}

const pillBase = 'inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-medium transition-colors';
const pillInactive =
  'border border-neutral-200 bg-white text-neutral-500 hover:bg-neutral-50 dark:border-neutral-700 dark:bg-transparent dark:text-neutral-400 dark:hover:bg-neutral-800';
const pillActive =
  'border border-transparent bg-neutral-900 text-white dark:bg-white dark:text-neutral-900';

export function PerformanceTable({ posts, total }: { posts: RankedPostPerformance[]; total: number }) {
  const [sortKey, setSortKey] = useState<SortKey>('score');
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('desc');
  const [platformFilter, setPlatformFilter] = useState<PlatformFilter>('all');
  const [dateRange, setDateRange] = useState<DateRange>('all');

  const filtered = useMemo(() => {
    const dateFrom = dateRange !== 'all' ? isoDateMinus(parseInt(dateRange, 10)) : null;
    return posts.filter(p => {
      if (platformFilter !== 'all' && p.platform !== platformFilter) return false;
      if (dateFrom && p.scheduledDate < dateFrom) return false;
      return true;
    });
  }, [posts, platformFilter, dateRange]);

  const sorted = useMemo(() => {
    const copy = [...filtered];
    copy.sort((a, b) => (sortDir === 'desc' ? b[sortKey] - a[sortKey] : a[sortKey] - b[sortKey]));
    return copy;
  }, [filtered, sortKey, sortDir]);

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
      {/* Filter bar */}
      <div className="flex flex-wrap items-center justify-between gap-3 px-4 pt-4 pb-3">
        {/* Platform pills */}
        <div className="flex flex-wrap items-center gap-1.5">
          {PLATFORM_FILTERS.map(({ value, label }) => (
            <button
              key={value}
              type="button"
              onClick={() => setPlatformFilter(value)}
              className={cn(pillBase, platformFilter === value ? pillActive : pillInactive)}
            >
              {value !== 'all' && (
                <PlatformBadge platform={value} size="sm" />
              )}
              {label}
            </button>
          ))}
        </div>

        {/* Date range pills */}
        <div className="flex flex-wrap items-center gap-1.5">
          {DATE_RANGES.map(({ value, label }) => (
            <button
              key={value}
              type="button"
              onClick={() => setDateRange(value)}
              className={cn(pillBase, dateRange === value ? pillActive : pillInactive)}
            >
              {label}
            </button>
          ))}
        </div>
      </div>

      {/* Count line */}
      <div className="flex justify-end px-4 pb-2">
        <span className="text-xs text-neutral-400 dark:text-neutral-500">
          Showing {sorted.length} of {total} posts
        </span>
      </div>

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
                  {col.key === 'score' ? (
                    <span className="inline-flex items-center gap-1">
                      {col.label}
                      <span title={SCORE_TOOLTIP}>
                        <Info className="h-3 w-3 text-neutral-400" />
                      </span>
                    </span>
                  ) : (
                    col.label
                  )}
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
          {sorted.length === 0 ? (
            <tr>
              <td
                colSpan={COLUMNS.length + 2}
                className="px-4 py-8 text-center text-sm text-neutral-400 dark:text-neutral-500"
              >
                No posts match the selected filters.
              </td>
            </tr>
          ) : (
            sorted.map((p, i) => (
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
                    {p.postType === 'video' && (
                      <Video className="h-3 w-3 text-blue-500" title="Video post" />
                    )}
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
                  <p className="mt-1 line-clamp-2 text-xs text-neutral-600 dark:text-neutral-300">{p.contentPreview}</p>
                </td>
                <td className="px-2 py-3 text-right align-top tabular-nums text-neutral-700 dark:text-neutral-300">{p.likes}</td>
                <td className="px-2 py-3 text-right align-top tabular-nums text-neutral-700 dark:text-neutral-300">{p.comments}</td>
                <td className="px-2 py-3 text-right align-top tabular-nums text-neutral-700 dark:text-neutral-300">{p.shares}</td>
                <td className="px-2 py-3 text-right align-top tabular-nums text-neutral-700 dark:text-neutral-300">{p.impressions}</td>
                <td className="px-2 py-3 text-right align-top tabular-nums text-neutral-700 dark:text-neutral-300">{p.reach}</td>
                <td className="px-2 py-3 text-right align-top tabular-nums text-neutral-700 dark:text-neutral-300">{p.engagementRate.toFixed(1)}%</td>
                <td className="px-4 py-3 text-right align-top tabular-nums font-semibold text-neutral-900 dark:text-white">{p.score.toFixed(1)}</td>
              </tr>
            ))
          )}
        </tbody>
      </table>
    </div>
  );
}
