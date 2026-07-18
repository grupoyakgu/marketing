import { getCommentLog } from '@/lib/social-comments';
import { Card } from '@/components/ui/Card';
import { Badge } from '@/components/ui/Badge';
import { PlatformBadge } from '@/components/ui/PlatformBadge';
import { MessageSquare } from 'lucide-react';

export const dynamic = 'force-dynamic';

function formatDate(iso: string | null): string {
  if (!iso) return '—';
  return new Date(iso).toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' });
}

export default async function CommentsPage() {
  const comments = await getCommentLog(100);

  return (
    <div className="mx-auto max-w-4xl space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight text-neutral-900 dark:text-white">Comments</h1>
        <p className="mt-1 text-sm text-neutral-500 dark:text-neutral-400">
          Comments Pepe has seen on recent posts, and what — if anything — it replied. Trigger a fresh
          check from Settings → Comment Check.
        </p>
      </div>

      {comments.length === 0 ? (
        <Card>
          <p className="flex items-center gap-2 text-sm text-neutral-400">
            <MessageSquare className="h-4 w-4" />
            No comments recorded yet.
          </p>
        </Card>
      ) : (
        <div className="space-y-3">
          {comments.map(c => (
            <Card key={c.id} className="space-y-2">
              <div className="flex items-start justify-between gap-3">
                <div className="flex items-center gap-2">
                  <PlatformBadge platform={c.platform} size="md" />
                  <div>
                    <p className="text-sm font-medium text-neutral-900 dark:text-white">
                      {c.authorName ?? 'Unknown'}
                    </p>
                    <p className="text-xs text-neutral-400">{formatDate(c.commentCreatedAt)}</p>
                  </div>
                </div>
                <Badge tone={c.replied ? 'positive' : 'neutral'}>
                  {c.replied ? 'Replied' : 'Awaiting reply'}
                </Badge>
              </div>

              <p className="rounded-xl bg-neutral-50 px-3 py-2 text-sm text-neutral-700 dark:bg-neutral-800 dark:text-neutral-300">
                {c.commentText}
              </p>

              {c.replied && c.replyText && (
                <div className="ml-4 border-l-2 border-neutral-200 pl-3 dark:border-neutral-700">
                  <p className="mb-1 text-xs font-medium text-neutral-500 dark:text-neutral-400">
                    Pepe replied{c.repliedAt ? ` · ${formatDate(c.repliedAt)}` : ''}
                  </p>
                  <p className="text-sm text-neutral-700 dark:text-neutral-300">{c.replyText}</p>
                </div>
              )}
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
