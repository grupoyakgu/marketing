import {
  getPostCounts,
  getPostsPublishedByDate,
  getPostedPostsForCommentCheck,
} from '@/lib/marketing-plan';
import {
  getAllAccountStats,
  getAccountGrowth,
  getFollowerHistory,
  getFacebookPostEngagement,
  getInstagramPostEngagement,
  getLinkedInPostEngagement,
  type PostEngagement,
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
} from 'lucide-react';

export const dynamic = 'force-dynamic';

async function loadOverview() {
  // Individual data sources (DB, Facebook, Instagram, LinkedIn) can fail independently —
  // Promise.allSettled + fallbacks keep the dashboard usable instead of hard-crashing the page.
  const [postCountsR, postsByDateR, accountStatsR, followerHistoryR, recentPostsR] = await Promise.allSettled([
    getPostCounts(),
    getPostsPublishedByDate(14),
    getAllAccountStats(),
    getFollowerHistory(30),
    getPostedPostsForCommentCheck(),
  ]);

  const postCounts =
    postCountsR.status === 'fulfilled' ? postCountsR.value : { total: 0, scheduled: 0, published: 0, failed: 0, pending: 0 };
  const postsByDate = postsByDateR.status === 'fulfilled' ? postsByDateR.value : [];
  const accountStats = accountStatsR.status === 'fulfilled' ? accountStatsR.value : [];
  const followerHistory = followerHistoryR.status === 'fulfilled' ? followerHistoryR.value : [];
  const recentPosts = recentPostsR.status === 'fulfilled' ? recentPostsR.value : [];

  const growth = accountStats.length > 0 ? await getAccountGrowth(accountStats).catch(() => []) : [];

  const engagements: PostEngagement[] = [];
  for (const row of recentPosts) {
    try {
      let eng: PostEngagement | null = null;
      if (row.platform === 'facebook') eng = await getFacebookPostEngagement(row.platform_post_id);
      else if (row.platform === 'instagram') eng = await getInstagramPostEngagement(row.platform_post_id);
      else if (row.platform === 'linkedin') eng = await getLinkedInPostEngagement(row.platform_post_id);
      if (eng) engagements.push(eng);
    } catch {}
  }

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
  };
}

export default async function OverviewPage() {
  const { postCounts, postsByDate, accountStats, followerHistory, growth, totals, totalEngagement, totalFollowers } =
    await loadOverview();

  const followerGrowthPct = growth.length
    ? growth.reduce((sum, g) => sum + (g.deltaPct ?? 0), 0) / growth.filter(g => g.deltaPct !== null).length || null
    : null;

  return (
    <div className="mx-auto max-w-7xl space-y-8">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight text-neutral-900 dark:text-white">Overview</h1>
        <p className="mt-1 text-sm text-neutral-500 dark:text-neutral-400">
          What Pepe has been up to across LinkedIn, Facebook, and Instagram.
        </p>
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
