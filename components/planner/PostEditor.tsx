'use client';

import { useEffect, useState } from 'react';
import { X, Check, Trash2, ImageIcon, ChevronRight, ChevronDown, ChevronLeft, FolderClosed } from 'lucide-react';
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

interface CloudinaryFolderImages {
  folder: string;
  images: CloudinaryImage[];
}

const PLATFORMS: Array<'linkedin' | 'instagram' | 'facebook'> = ['linkedin', 'instagram', 'facebook'];
const IMAGES_PER_PAGE = 20;

export function PostEditor({
  post,
  onClose,
  onSaved,
  onPostUpdated,
}: {
  post: MarketingPost | null;
  onClose: () => void;
  onSaved: () => void;
  onPostUpdated: (post: MarketingPost) => void;
}) {
  const [content, setContent] = useState('');
  const [scheduledDate, setScheduledDate] = useState('');
  const [scheduledTime, setScheduledTime] = useState('');
  const [platform, setPlatform] = useState<'linkedin' | 'instagram' | 'facebook'>('linkedin');
  const [imageUrl, setImageUrl] = useState<string | null>(null);
  const [folders, setFolders] = useState<CloudinaryFolderImages[] | null>(null);
  const [expandedFolders, setExpandedFolders] = useState<Record<string, boolean>>({});
  const [folderPage, setFolderPage] = useState<Record<string, number>>({});
  const [saving, setSaving] = useState(false);
  const [savingImage, setSavingImage] = useState(false);
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
    if (!post || !editable || folders !== null) return;
    fetch('/api/dashboard/images')
      .then(res => res.json())
      .then(body => setFolders(body.folders ?? []))
      .catch(() => setFolders([]));
  }, [post, editable, folders]);

  function toggleFolder(folder: string) {
    setExpandedFolders(prev => ({ ...prev, [folder]: !prev[folder] }));
  }

  function setPage(folder: string, page: number) {
    setFolderPage(prev => ({ ...prev, [folder]: page }));
  }

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

  // Picking an image saves immediately, independent of the Save button — otherwise
  // closing the panel right after picking silently discards the selection, since it
  // would have only lived in local state until an unrelated field was also edited.
  async function handleImageSelect(url: string) {
    const previous = imageUrl;
    setImageUrl(url);
    setSavingImage(true);
    setError(null);
    try {
      const res = await fetch(`/api/dashboard/plan/${post!.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ image_url: url }),
      });
      if (!res.ok) throw new Error((await res.json().catch(() => ({}))).error ?? 'Failed to save image.');
      const body = await res.json();
      onPostUpdated(body.post);
    } catch (err) {
      setImageUrl(previous);
      setError(err instanceof Error ? err.message : 'Failed to save image.');
    } finally {
      setSavingImage(false);
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
                {savingImage && <span className="font-normal text-neutral-400">Saving…</span>}
              </label>
              {folders === null ? (
                <p className="text-xs text-neutral-400">Loading images…</p>
              ) : folders.length === 0 ? (
                <p className="text-xs text-neutral-400">No Cloudinary folders configured.</p>
              ) : (
                <div className="space-y-2">
                  {folders.map(f => {
                    const isOpen = !!expandedFolders[f.folder];
                    const totalPages = Math.max(1, Math.ceil(f.images.length / IMAGES_PER_PAGE));
                    const page = Math.min(folderPage[f.folder] ?? 0, totalPages - 1);
                    const pageImages = f.images.slice(page * IMAGES_PER_PAGE, page * IMAGES_PER_PAGE + IMAGES_PER_PAGE);
                    return (
                      <div key={f.folder} className="rounded-xl border border-neutral-200 dark:border-neutral-700">
                        <button
                          type="button"
                          onClick={() => toggleFolder(f.folder)}
                          className="flex w-full items-center gap-2 px-3 py-2 text-left text-sm font-medium text-neutral-700 dark:text-neutral-300"
                        >
                          {isOpen ? <ChevronDown className="h-3.5 w-3.5" /> : <ChevronRight className="h-3.5 w-3.5" />}
                          <FolderClosed className="h-3.5 w-3.5 text-neutral-400" />
                          {f.folder}
                          <span className="ml-auto text-xs font-normal text-neutral-400">
                            {f.images.length} image{f.images.length === 1 ? '' : 's'}
                          </span>
                        </button>
                        {isOpen && (
                          <div className="border-t border-neutral-200 p-2 dark:border-neutral-700">
                            {f.images.length === 0 ? (
                              <p className="px-1 py-1 text-xs text-neutral-400">No images in this directory.</p>
                            ) : (
                              <>
                                <div className="grid grid-cols-4 gap-2">
                                  {pageImages.map(img => (
                                    // eslint-disable-next-line @next/next/no-img-element
                                    <img
                                      key={img.id}
                                      src={img.url}
                                      alt={img.name}
                                      onClick={() => handleImageSelect(img.url)}
                                      className={cn(
                                        savingImage && 'pointer-events-none opacity-60',
                                        'aspect-square cursor-pointer rounded-lg object-cover ring-2 ring-transparent transition hover:opacity-80',
                                        imageUrl === img.url && 'ring-neutral-900 dark:ring-white'
                                      )}
                                    />
                                  ))}
                                </div>
                                {totalPages > 1 && (
                                  <div className="mt-2 flex items-center justify-between text-xs text-neutral-500 dark:text-neutral-400">
                                    <button
                                      type="button"
                                      onClick={() => setPage(f.folder, page - 1)}
                                      disabled={page === 0}
                                      className="flex items-center gap-1 rounded-lg px-2 py-1 disabled:opacity-40 hover:bg-neutral-100 dark:hover:bg-neutral-800"
                                    >
                                      <ChevronLeft className="h-3.5 w-3.5" />
                                      Prev
                                    </button>
                                    <span>
                                      {page * IMAGES_PER_PAGE + 1}–{Math.min((page + 1) * IMAGES_PER_PAGE, f.images.length)} of{' '}
                                      {f.images.length}
                                    </span>
                                    <button
                                      type="button"
                                      onClick={() => setPage(f.folder, page + 1)}
                                      disabled={page >= totalPages - 1}
                                      className="flex items-center gap-1 rounded-lg px-2 py-1 disabled:opacity-40 hover:bg-neutral-100 dark:hover:bg-neutral-800"
                                    >
                                      Next
                                      <ChevronRight className="h-3.5 w-3.5" />
                                    </button>
                                  </div>
                                )}
                              </>
                            )}
                          </div>
                        )}
                      </div>
                    );
                  })}
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
