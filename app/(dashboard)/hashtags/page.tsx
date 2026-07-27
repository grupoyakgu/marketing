import { getTrackedHashtagStats, getConfiguredHashtags } from '@/lib/instagram-hashtags';
import { Card } from '@/components/ui/Card';
import { RefreshHashtagsCard } from '@/components/dashboard/RefreshHashtagsCard';
import { Hash } from 'lucide-react';

export const dynamic = 'force-dynamic';

function formatDate(iso: string): string {
  return new Date(iso).toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' });
}

export default async function HashtagsPage() {
  const [stats, configuredCount] = await Promise.all([
    getTrackedHashtagStats(),
    Promise.resolve(getConfiguredHashtags().length),
  ]);

  return (
    <div className="mx-auto max-w-4xl space-y-6">
      <div>
        <h1 className="flex items-center gap-2 text-2xl font-semibold tracking-tight text-neutral-900 dark:text-white">
          <Hash className="h-5 w-5" />
          Hashtags
        </h1>
        <p className="mt-1 text-sm text-neutral-500 dark:text-neutral-400">
          How hashtags relevant to Grupo YAKGU are performing right now, based on their current
          top public posts — for content research, not interaction.
        </p>
      </div>

      <RefreshHashtagsCard />

      {configuredCount === 0 ? (
        <Card>
          <p className="text-sm text-neutral-500 dark:text-neutral-400">
            No hashtags configured yet — set{' '}
            <code className="rounded bg-neutral-100 px-1 py-0.5 dark:bg-neutral-800">
              INSTAGRAM_TRACKED_HASHTAGS
            </code>{' '}
            (comma-separated, no # needed) to start tracking.
          </p>
        </Card>
      ) : stats.length === 0 ? (
        <Card>
          <p className="text-sm text-neutral-400">No data yet — click &quot;Refresh now&quot; above to fetch it.</p>
        </Card>
      ) : (
        <div className="space-y-3">
          {stats.map(h => (
            <Card key={h.tag} className="space-y-3">
              <div className="flex items-center justify-between">
                <h3 className="text-base font-semibold text-neutral-900 dark:text-white">#{h.tag}</h3>
                <span className="text-xs text-neutral-400">Updated {formatDate(h.fetchedAt)}</span>
              </div>

              <div className="grid grid-cols-3 gap-3 text-center">
                <div>
                  <p className="text-xs text-neutral-500 dark:text-neutral-400">Posts sampled</p>
                  <p className="text-sm font-semibold text-neutral-900 dark:text-white">{h.mediaCount}</p>
                </div>
                <div>
                  <p className="text-xs text-neutral-500 dark:text-neutral-400">Avg likes</p>
                  <p className="text-sm font-semibold text-neutral-900 dark:text-white">{h.avgLikes.toFixed(1)}</p>
                </div>
                <div>
                  <p className="text-xs text-neutral-500 dark:text-neutral-400">Avg comments</p>
                  <p className="text-sm font-semibold text-neutral-900 dark:text-white">{h.avgComments.toFixed(1)}</p>
                </div>
              </div>

              {h.topPosts.length > 0 && (
                <div className="space-y-1 border-t border-neutral-100 pt-2 dark:border-neutral-800">
                  <p className="text-xs font-medium text-neutral-500 dark:text-neutral-400">Top posts</p>
                  {h.topPosts.slice(0, 3).map(p => (
                    <a
                      key={p.permalink}
                      href={p.permalink}
                      target="_blank"
                      rel="noreferrer"
                      className="block truncate text-xs text-neutral-600 hover:underline dark:text-neutral-300"
                    >
                      {p.likeCount} likes · {p.commentsCount} comments — {p.permalink}
                    </a>
                  ))}
                </div>
              )}
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
