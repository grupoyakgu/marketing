import { Badge } from '@/components/ui/Badge';
import { PlatformBadge } from '@/components/ui/PlatformBadge';
import type { MarketingPost } from '@/lib/marketing-plan';

const STATUS_TONE: Record<string, 'neutral' | 'positive' | 'negative'> = {
  draft: 'neutral',
  approved: 'neutral',
  posted: 'positive',
  failed: 'negative',
};

export function PostCard({ post, onClick }: { post: MarketingPost; onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      className="w-full rounded-xl border border-neutral-200 bg-white p-3 text-left transition hover:border-neutral-300 hover:shadow-sm dark:border-neutral-800 dark:bg-neutral-900 dark:hover:border-neutral-700"
    >
      <div className="mb-2 flex items-center justify-between">
        <div className="flex items-center gap-1.5">
          <PlatformBadge platform={post.platform} />
          <span className="text-xs font-medium text-neutral-500 dark:text-neutral-400">
            {post.scheduled_time.slice(0, 5)}
          </span>
        </div>
        <Badge tone={STATUS_TONE[post.status ?? 'draft']}>{post.status}</Badge>
      </div>
      <p className="line-clamp-3 text-xs text-neutral-700 dark:text-neutral-300">{post.content}</p>
    </button>
  );
}
