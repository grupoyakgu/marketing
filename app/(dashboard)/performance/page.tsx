import { getPerformanceLeaderboard } from '@/lib/engagement';
import { Card } from '@/components/ui/Card';
import { PerformanceTable } from '@/components/performance/PerformanceTable';

export const dynamic = 'force-dynamic';

export default async function PerformancePage() {
  const { posts, total } = await getPerformanceLeaderboard(300);

  return (
    <div className="mx-auto max-w-5xl space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight text-neutral-900 dark:text-white">Performance</h1>
        <p className="mt-1 text-sm text-neutral-500 dark:text-neutral-400">
          Every published post ranked by a combined score across likes, comments, shares, reach, and engagement rate —
          click any column to sort by it instead. Refreshed daily alongside the rest of the dashboard&apos;s cached stats.
        </p>
      </div>

      <Card className="p-0">
        <PerformanceTable posts={posts} total={total} />
      </Card>
    </div>
  );
}
