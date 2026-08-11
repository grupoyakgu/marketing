'use client';

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import {
  MessageCircle,
  ThumbsUp,
  Share2,
  Trash2,
  Check,
  ExternalLink,
  Settings,
  Eye,
  EyeOff,
} from 'lucide-react';
import { Card } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { Badge } from '@/components/ui/Badge';
import { PlatformBadge } from '@/components/ui/PlatformBadge';
import { cn } from '@/lib/cn';

type Platform = 'linkedin' | 'facebook' | 'instagram';
type PlatformFilter = 'all' | Platform;

interface InteractionPost {
  id: string;
  platform: Platform;
  url: string;
  author: string | null;
  content_preview: string | null;
  topic: string | null;
  likes: number | null;
  comments: number | null;
  shares: number | null;
  status: 'active' | 'done';
  discovered_at: string;
  done_at: string | null;
}

const PLATFORM_FILTERS: { value: PlatformFilter; label: string }[] = [
  { value: 'all', label: 'All' },
  { value: 'linkedin', label: 'LinkedIn' },
  { value: 'facebook', label: 'Facebook' },
  { value: 'instagram', label: 'Instagram' },
];

function formatDate(iso: string): string {
  return new Date(iso).toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' });
}

export default function InteractionsPage() {
  const [posts, setPosts] = useState<InteractionPost[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [platformFilter, setPlatformFilter] = useState<PlatformFilter>('all');
  const [showDone, setShowDone] = useState(false);
  const [busyId, setBusyId] = useState<string | null>(null);

  const load = useCallback(async () => {
    setError(null);
    const params = new URLSearchParams();
    if (platformFilter !== 'all') params.set('platform', platformFilter);
    if (showDone) params.set('include_done', 'true');
    try {
      const res = await fetch(`/api/dashboard/interactions?${params}`);
      const body = await res.json();
      if (!res.ok) throw new Error(body.error ?? 'Failed to load interactions');
      setPosts(body.posts);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load interactions');
    }
  }, [platformFilter, showDone]);

  useEffect(() => { load(); }, [load]);

  async function markDone(id: string) {
    setBusyId(id);
    try {
      const res = await fetch(`/api/dashboard/interactions/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: 'done' }),
      });
      if (!res.ok) throw new Error((await res.json()).error ?? 'Failed to mark done');
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to mark done');
    } finally {
      setBusyId(null);
    }
  }

  async function remove(id: string) {
    setBusyId(id);
    try {
      const res = await fetch(`/api/dashboard/interactions/${id}`, { method: 'DELETE' });
      if (!res.ok) throw new Error((await res.json()).error ?? 'Failed to remove');
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to remove');
    } finally {
      setBusyId(null);
    }
  }

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight text-neutral-900 dark:text-white">
            Interactions
          </h1>
          <p className="mt-1 text-sm text-neutral-500 dark:text-neutral-400">
            Posts from other people/pages worth commenting on, found by Pepe from your topics of interest.
          </p>
        </div>
        <Link
          href="/interactions/settings"
          className="flex shrink-0 items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-xs text-neutral-400 transition hover:bg-neutral-100 hover:text-neutral-600 dark:hover:bg-neutral-800 dark:hover:text-neutral-300"
        >
          <Settings className="h-3.5 w-3.5" />
          Settings
        </Link>
      </div>

      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex gap-1 rounded-xl bg-neutral-100 p-1 dark:bg-neutral-800">
          {PLATFORM_FILTERS.map(f => (
            <button
              key={f.value}
              onClick={() => setPlatformFilter(f.value)}
              className={cn(
                'rounded-lg px-2.5 py-1 text-xs font-medium transition',
                platformFilter === f.value
                  ? 'bg-white text-neutral-900 shadow-sm dark:bg-neutral-700 dark:text-white'
                  : 'text-neutral-500 dark:text-neutral-400'
              )}
            >
              {f.label}
            </button>
          ))}
        </div>
        <Button variant="ghost" onClick={() => setShowDone(v => !v)}>
          {showDone ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
          {showDone ? 'Hide done' : 'Show done'}
        </Button>
      </div>

      {error && <p className="text-sm text-red-600 dark:text-red-400">{error}</p>}

      {posts === null ? (
        <Card><p className="text-sm text-neutral-400">Loading…</p></Card>
      ) : posts.length === 0 ? (
        <Card>
          <p className="text-sm text-neutral-500 dark:text-neutral-400">
            {showDone
              ? 'Nothing here yet.'
              : 'No active posts right now — new ones are found automatically. Check Settings to set topics and how many to keep per platform.'}
          </p>
        </Card>
      ) : (
        <div className="space-y-3">
          {posts.map(post => (
            <Card key={post.id} className="space-y-3">
              <div className="flex items-start justify-between gap-3">
                <div className="flex items-center gap-2">
                  <PlatformBadge platform={post.platform} size="md" />
                  <div>
                    <p className="text-sm font-medium text-neutral-900 dark:text-white">
                      {post.author ?? 'Unknown author'}
                    </p>
                    <p className="text-xs text-neutral-400">{formatDate(post.discovered_at)}</p>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  {post.topic && <Badge>{post.topic}</Badge>}
                  {post.status === 'done' && <Badge tone="positive">Done</Badge>}
                </div>
              </div>

              {post.content_preview && (
                <p className="rounded-xl bg-neutral-50 px-3 py-2 text-sm text-neutral-700 dark:bg-neutral-800 dark:text-neutral-300">
                  {post.content_preview}
                </p>
              )}

              <div className="flex flex-wrap items-center justify-between gap-3">
                <div className="flex items-center gap-4 text-xs text-neutral-500 dark:text-neutral-400">
                  {post.likes !== null && (
                    <span className="flex items-center gap-1"><ThumbsUp className="h-3.5 w-3.5" /> {post.likes.toLocaleString()}</span>
                  )}
                  {post.comments !== null && (
                    <span className="flex items-center gap-1"><MessageCircle className="h-3.5 w-3.5" /> {post.comments.toLocaleString()}</span>
                  )}
                  {post.shares !== null && (
                    <span className="flex items-center gap-1"><Share2 className="h-3.5 w-3.5" /> {post.shares.toLocaleString()}</span>
                  )}
                  <a
                    href={post.url}
                    target="_blank"
                    rel="noreferrer"
                    className="flex items-center gap-1 font-medium text-neutral-700 hover:underline dark:text-neutral-200"
                  >
                    <ExternalLink className="h-3.5 w-3.5" /> View post
                  </a>
                </div>

                <div className="flex items-center gap-2">
                  {post.status === 'active' && (
                    <Button variant="secondary" disabled={busyId === post.id} onClick={() => markDone(post.id)}>
                      <Check className="h-3.5 w-3.5" /> Mark done
                    </Button>
                  )}
                  <Button variant="danger" disabled={busyId === post.id} onClick={() => remove(post.id)}>
                    <Trash2 className="h-3.5 w-3.5" /> Remove
                  </Button>
                </div>
              </div>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
