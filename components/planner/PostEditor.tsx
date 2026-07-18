'use client';

import { useEffect, useState } from 'react';
import { X, Check, Trash2, ImageIcon } from 'lucide-react';
import { Button } from '@/components/ui/Button';
import { Badge } from '@/components/ui/Badge';
import { PlatformBadge } from '@/components/ui/PlatformBadge';
import { cn } from '@/lib/cn';
import type { MarketingPost } from '@/lib/marketing-plan';

interface CloudinaryImage {
  id: string;
  name: string;
  url: string;
}

const PLATFORMS: Array<'linkedin' | 'instagram' | 'facebook'> = ['linkedin', 'instagram', 'facebook'];

export function PostEditor({
  post,
  onClose,
  onSaved,
}: {
  post: MarketingPost | null;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [content, setContent] = useState('');
  const [scheduledDate, setScheduledDate] = useState('');
  const [scheduledTime, setScheduledTime] = useState('');
  const [platform, setPlatform] = useState<'linkedin' | 'instagram' | 'facebook'>('linkedin');
  const [imageUrl, setImageUrl] = useState<string | null>(null);
  const [images, setImages] = useState<CloudinaryImage[] | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const editable = post ? post.status === 'draft' || post.status === 'approved' : false;

  useEffect(() => {
    if (!post) return;
    setContent(post.content);
    setScheduledDate(post.scheduled_date);
    setScheduledTime(post.scheduled_time.slice(0, 5));
    setPlatform(post.platform);
    setImageUrl(post.image_url ?? null);
    setError(null);
  }, [post]);

  useEffect(() => {
    if (!post || !editable || images !== null) return;
    fetch('/api/dashboard/images')
      .then(res => res.json())
      .then(body => setImages(body.images ?? []))
      .catch(() => setImages([]));
  }, [post, editable, images]);

  if (!post) return null;

  async function handleSave() {
    setSaving(true);
    setError(null);
    try {
      const res = await fetch(`/api/dashboard/plan/${post!.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ content, scheduled_date: scheduledDate, scheduled_time: scheduledTime, platform, image_url: imageUrl }),
      });
      if (!res.ok) throw new Error((await res.json().catch(() => ({}))).error ?? 'Failed to save.');
      onSaved();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to save.');
    } finally {
      setSaving(false);
    }
  }

  async function handleApprove() {
    setSaving(true);
    try {
      await fetch(`/api/dashboard/plan/${post!.id}/approve`, { method: 'POST' });
      onSaved();
    } finally {
      setSaving(false);
    }
  }

  async function handleReject() {
    if (!window.confirm('Remove this post from the plan?')) return;
    setSaving(true);
    try {
      await fetch(`/api/dashboard/plan/${post!.id}`, { method: 'DELETE' });
      onSaved();
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex justify-end">
      <div className="absolute inset-0 bg-black/20" onClick={onClose} />
      <div className="relative flex h-full w-full max-w-md flex-col overflow-y-auto border-l border-neutral-200 bg-white p-6 shadow-xl dark:border-neutral-800 dark:bg-neutral-900">
        <div className="mb-6 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <PlatformBadge platform={post.platform} size="md" />
            <h2 className="text-lg font-semibold text-neutral-900 dark:text-white">Edit post</h2>
          </div>
          <button onClick={onClose} className="rounded-lg p-1.5 text-neutral-400 hover:bg-neutral-100 dark:hover:bg-neutral-800">
            <X className="h-4 w-4" />
          </button>
        </div>

        {!editable && (
          <div className="mb-4 rounded-xl bg-neutral-100 px-3 py-2 text-sm text-neutral-600 dark:bg-neutral-800 dark:text-neutral-300">
            This post is <Badge tone={post.status === 'posted' ? 'positive' : 'negative'}>{post.status}</Badge> and can no
            longer be edited.
            {post.post_url && (
              <a href={post.post_url} target="_blank" rel="noreferrer" className="ml-1 underline">
                View live
              </a>
            )}
          </div>
        )}

        {imageUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={imageUrl} alt="Selected" className="mb-4 h-40 w-full rounded-xl object-cover" />
        ) : (
          <div className="mb-4 flex h-40 w-full flex-col items-center justify-center gap-1.5 rounded-xl border border-dashed border-neutral-200 text-neutral-400 dark:border-neutral-800 dark:text-neutral-600">
            <ImageIcon className="h-5 w-5" />
            <span className="text-xs">
              {editable ? 'No image selected yet' : 'No image on record for this post'}
            </span>
          </div>
        )}

        <div className="space-y-4">
          <div>
            <label className="mb-1.5 block text-xs font-medium text-neutral-500">Caption</label>
            <textarea
              value={content}
              onChange={e => setContent(e.target.value)}
              disabled={!editable}
              rows={6}
              className="w-full rounded-xl border border-neutral-200 bg-neutral-50 px-3 py-2 text-sm outline-none focus:border-neutral-400 disabled:opacity-60 dark:border-neutral-700 dark:bg-neutral-800 dark:text-white"
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="mb-1.5 block text-xs font-medium text-neutral-500">Date</label>
              <input
                type="date"
                value={scheduledDate}
                onChange={e => setScheduledDate(e.target.value)}
                disabled={!editable}
                className="w-full rounded-xl border border-neutral-200 bg-neutral-50 px-3 py-2 text-sm outline-none focus:border-neutral-400 disabled:opacity-60 dark:border-neutral-700 dark:bg-neutral-800 dark:text-white"
              />
            </div>
            <div>
              <label className="mb-1.5 block text-xs font-medium text-neutral-500">Time</label>
              <input
                type="time"
                value={scheduledTime}
                onChange={e => setScheduledTime(e.target.value)}
                disabled={!editable}
                className="w-full rounded-xl border border-neutral-200 bg-neutral-50 px-3 py-2 text-sm outline-none focus:border-neutral-400 disabled:opacity-60 dark:border-neutral-700 dark:bg-neutral-800 dark:text-white"
              />
            </div>
          </div>

          <div>
            <label className="mb-1.5 block text-xs font-medium text-neutral-500">Platform</label>
            <select
              value={platform}
              onChange={e => setPlatform(e.target.value as typeof platform)}
              disabled={!editable}
              className="w-full rounded-xl border border-neutral-200 bg-neutral-50 px-3 py-2 text-sm capitalize outline-none focus:border-neutral-400 disabled:opacity-60 dark:border-neutral-700 dark:bg-neutral-800 dark:text-white"
            >
              {PLATFORMS.map(p => (
                <option key={p} value={p}>
                  {p}
                </option>
              ))}
            </select>
          </div>

          {editable && (
            <div>
              <label className="mb-1.5 flex items-center gap-1.5 text-xs font-medium text-neutral-500">
                <ImageIcon className="h-3.5 w-3.5" />
                Image
              </label>
              {images === null ? (
                <p className="text-xs text-neutral-400">Loading images…</p>
              ) : images.length === 0 ? (
                <p className="text-xs text-neutral-400">No Cloudinary images found.</p>
              ) : (
                <div className="grid grid-cols-4 gap-2">
                  {images.map(img => (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      key={img.id}
                      src={img.url}
                      alt={img.name}
                      onClick={() => setImageUrl(img.url)}
                      className={cn(
                        'aspect-square cursor-pointer rounded-lg object-cover ring-2 ring-transparent transition hover:opacity-80',
                        imageUrl === img.url && 'ring-neutral-900 dark:ring-white'
                      )}
                    />
                  ))}
                </div>
              )}
            </div>
          )}
        </div>

        {error && <p className="mt-4 text-sm text-red-600 dark:text-red-400">{error}</p>}

        {editable && (
          <div className="mt-6 flex gap-2">
            <Button onClick={handleSave} disabled={saving}>
              Save
            </Button>
            {post.status === 'draft' && (
              <Button variant="secondary" onClick={handleApprove} disabled={saving}>
                <Check className="h-4 w-4" />
                Approve
              </Button>
            )}
            <Button variant="danger" onClick={handleReject} disabled={saving} className="ml-auto">
              <Trash2 className="h-4 w-4" />
              Reject
            </Button>
          </div>
        )}
      </div>
    </div>
  );
}
