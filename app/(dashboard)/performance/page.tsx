import { getPerformanceLeaderboard } from '@/lib/engagement';
import { Card } from '@/components/ui/Card';
import { PlatformBadge } from '@/components/ui/PlatformBadge';
import { Trophy, ExternalLink } from 'lucide-react';

export const dynamic = 'force-dynamic';

function formatDate(dateStr: string): string {
  return new Date(dateStr + 'T00:00:00Z').toLocaleDateString('en-US', { month: 'short', day: 'numeric', timeZone: 'UTC' });
}

export default async function PerformancePage() {
  const leaderboard = await getPerformanceLeaderboard(50);

  return (
    <div className="mx-auto max-w-5xl space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight text-neutral-900 dark:text-white">Performance</h1>
        <p className="mt-1 text-sm text-neutral-500 dark:text-neutral-400">
          Every published post ranked by a combined score across likes, comments, shares, reach, and engagement rate.
          Refreshed daily alongside the rest of the dashboard&apos;s cached stats.
        </p>
      </div>

      <Card className="p-0">
        {leaderboard.length === 0 ? (
          <p className="p-6 text-center text-sm text-neutral-400 dark:text-neutral-500">
            No published posts with engagement data yet.
          </p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead>
                <tr className="border-b border-neutral-200 text-xs uppercase tracking-wide text-neutral-400 dark:border-neutral-800">
                  <th className="px-4 py-3 font-medium">#</th>
                  <th className="px-2 py-3 font-medium">Post</th>
                  <th className="px-2 py-3 text-right font-medium">Likes</th>
                  <th className="px-2 py-3 text-right font-medium">Comments</th>
                  <th className="px-2 py-3 text-right font-medium">Shares</th>
                  <th className="px-2 py-3 text-right font-medium">Reach</th>
                  <th className="px-2 py-3 text-right font-medium">Eng. rate</th>
                  <th className="px-4 py-3 text-right font-medium">Score</th>
                </tr>
              </thead>
              <tbody>
                {leaderboard.map((p, i) => (
                  <tr
                    key={p.postId}
                    className="border-b border-neutral-100 last:border-0 hover:bg-neutral-50 dark:border-neutral-800/60 dark:hover:bg-neutral-800/40"
                  >
                    <td className="px-4 py-3 align-top text-neutral-400">
                      {i === 0 ? <Trophy className="h-4 w-4 text-amber-500" /> : i + 1}
                    </td>
                    <td className="max-w-md px-2 py-3 align-top">
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
                      <p className="mt-1 line-clamp-2 text-xs text-neutral-600 dark:text-neutral-300">{p.contentPreview}</p>
                    </td>
                    <td className="px-2 py-3 text-right align-top tabular-nums text-neutral-700 dark:text-neutral-300">{p.likes}</td>
                    <td className="px-2 py-3 text-right align-top tabular-nums text-neutral-700 dark:text-neutral-300">{p.comments}</td>
                    <td className="px-2 py-3 text-right align-top tabular-nums text-neutral-700 dark:text-neutral-300">{p.shares}</td>
                    <td className="px-2 py-3 text-right align-top tabular-nums text-neutral-700 dark:text-neutral-300">{p.reach}</td>
                    <td className="px-2 py-3 text-right align-top tabular-nums text-neutral-700 dark:text-neutral-300">{p.engagementRate.toFixed(1)}%</td>
                    <td className="px-4 py-3 text-right align-top tabular-nums font-semibold text-neutral-900 dark:text-white">{p.score.toFixed(1)}</td>
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
