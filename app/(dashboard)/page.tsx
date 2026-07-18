import {
  getPostCounts,
  getPostsPublishedByDate,
  getPostedPostsForCommentCheck,
} from '@/lib/marketing-plan';
import {
  getLatestAccountStats,
  getAccountGrowth,
  getFollowerHistory,
  getCachedPostEngagements,
  getRefreshStatus,
} from '@/lib/engagement';
import { KpiCard } from '@/components/ui/KpiCard';
import { Card } from '@/components/ui/Card';
import { FollowerGrowthChart } from '@/components/charts/FollowerGrowthChart';
import { PostsOverTimeChart } from '@/components/charts/PostsOverTimeChart';
import { PlatformComparisonChart } from '@/components/charts/PlatformComparisonChart';
import {
  FileText,
  Clock,
  CheckCircle2,
  XCircle,
  Hourglass,
  Users,
  Heart,
  Eye,
  TrendingUp,
  ThumbsUp,
  MessageCircle,
  Share2,
  RefreshCw,
} from 'lucide-react';
import Link from 'next/link';

export const dynamic = 'force-dynamic';

async function loadOverview() {
  // Account stats and post engagement come from cache tables (populated by the
  // daily refresh cron / the "Refresh now" action in Settings > Data Sync)
  // instead of calling Facebook/Instagram/LinkedIn live on every page load —
  // those external calls used to run serially and added several seconds to
  // every visit, most noticeably right after login.
  const [postCountsR, postsByDateR, accountStatsR, followerHistoryR, recentPostsR, refreshStatusR] =
    await Promise.allSettled([
      getPostCounts(),
      getPostsPublishedByDate(14),
      getLatestAccountStats(),
      getFollowerHistory(30),
      getPostedPostsForCommentCheck(),
      getRefreshStatus(),
    ]);

  const postCounts =
    postCountsR.status === 'fulfilled' ? postCountsR.value : { total: 0, scheduled: 0, published: 0, failed: 0, pending: 0 };
  const postsByDate = postsByDateR.status === 'fulfilled' ? postsByDateR.value : [];
  const accountStats = accountStatsR.status === 'fulfilled' ? accountStatsR.value : [];
  const followerHistory = followerHistoryR.status === 'fulfilled' ? followerHistoryR.value : [];
  const recentPosts = recentPostsR.status === 'fulfilled' ? recentPostsR.value : [];
  const refreshStatus =
    refreshStatusR.status === 'fulfilled'
      ? refreshStatusR.value
      : { refreshedAt: null, durationMs: null, postsRefreshed: null, accountsRefreshed: null };

  const growth = accountStats.length > 0 ? await getAccountGrowth(accountStats).catch(() => []) : [];
  const engagements = recentPosts.length > 0 ? await getCachedPostEngagements(recentPosts).catch(() => []) : [];

  const totals = engagements.reduce(
    (acc, e) => ({
      likes: acc.likes + e.likes,
      comments: acc.comments + e.comments,
      shares: acc.shares + e.shares,
      impressions: acc.impressions + e.impressions,
      reach: acc.reach + e.reach,
    }),
    { likes: 0, comments: 0, shares: 0, impressions: 0, reach: 0 }
  );

  return {
    postCounts,
    postsByDate,
    accountStats,
    followerHistory,
    growth,
    totals,
    totalEngagement: totals.likes + totals.comments + totals.shares,
    totalFollowers: accountStats.reduce((sum, s) => sum + s.followers, 0),
    refreshStatus,
  };
}

function formatRefreshedAt(iso: string | null): string {
  if (!iso) return 'Data not refreshed yet';
  const diffMs = Date.now() - new Date(iso).getTime();
  const mins = Math.round(diffMs / 60000);
  if (mins < 1) return 'Data refreshed just now';
  if (mins < 60) return `Data refreshed ${mins} minute${mins === 1 ? '' : 's'} ago`;
  const hours = Math.round(mins / 60);
  if (hours < 24) return `Data refreshed ${hours} hour${hours === 1 ? '' : 's'} ago`;
  const days = Math.round(hours / 24);
  return `Data refreshed ${days} day${days === 1 ? '' : 's'} ago`;
}

export default async function OverviewPage() {
  const {
    postCounts,
    postsByDate,
    accountStats,
    followerHistory,
    growth,
    totals,
    totalEngagement,
    totalFollowers,
    refreshStatus,
  } = await loadOverview();

  const followerGrowthPct = growth.length
    ? growth.reduce((sum, g) => sum + (g.deltaPct ?? 0), 0) / growth.filter(g => g.deltaPct !== null).length || null
    : null;

  return (
    <div className="mx-auto max-w-7xl space-y-8">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight text-neutral-900 dark:text-white">Overview</h1>
          <p className="mt-1 text-sm text-neutral-500 dark:text-neutral-400">
            What Pepe has been up to across LinkedIn, Facebook, and Instagram.
          </p>
        </div>
        <Link
          href="/settings/data"
          className="flex shrink-0 items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-xs text-neutral-400 transition hover:bg-neutral-100 hover:text-neutral-600 dark:hover:bg-neutral-800 dark:hover:text-neutral-300"
        >
          <RefreshCw className="h-3.5 w-3.5" />
          {formatRefreshedAt(refreshStatus.refreshedAt)}
        </Link>
      </div>

      <section className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-5">
        <KpiCard label="Total Posts" value={postCounts.total} icon={FileText} />
        <KpiCard label="Scheduled" value={postCounts.scheduled} icon={Clock} />
        <KpiCard label="Published" value={postCounts.published} icon={CheckCircle2} />
        <KpiCard label="Failed" value={postCounts.failed} icon={XCircle} />
        <KpiCard label="Pending" value={postCounts.pending} icon={Hourglass} />
      </section>

      <section className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-6">
        <KpiCard
          label="Followers"
          value={totalFollowers}
          icon={Users}
          deltaPct={followerGrowthPct ?? undefined}
        />
        <KpiCard label="Total Engagement" value={totalEngagement} icon={Heart} />
        <KpiCard label="Reach" value={totals.reach} icon={Eye} />
        <KpiCard label="Impressions" value={totals.impressions} icon={TrendingUp} />
        <KpiCard label="Likes" value={totals.likes} icon={ThumbsUp} />
        <KpiCard label="Comments" value={totals.comments} icon={MessageCircle} />
      </section>

      <section className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <Card>
          <h2 className="mb-4 text-sm font-semibold text-neutral-900 dark:text-white">Follower growth</h2>
          <FollowerGrowthChart data={followerHistory} />
        </Card>
        <Card>
          <h2 className="mb-4 text-sm font-semibold text-neutral-900 dark:text-white">Posts published (14 days)</h2>
          <PostsOverTimeChart data={postsByDate} />
        </Card>
      </section>

      <section className="grid grid-cols-1 gap-4">
        <Card>
          <h2 className="mb-4 text-sm font-semibold text-neutral-900 dark:text-white">Followers by platform</h2>
          <PlatformComparisonChart data={accountStats} />
        </Card>
      </section>

      <section className="flex items-center gap-2 text-xs text-neutral-400">
        <Share2 className="h-3.5 w-3.5" />
        Shares this week: {totals.shares.toLocaleString()}
      </section>
    </div>
  );
}
