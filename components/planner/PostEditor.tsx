'use client';

import { useEffect, useState } from 'react';
import { X, Check, Trash2, ImageIcon, ChevronRight, ChevronDown, ChevronLeft, FolderClosed, RotateCw, Copy, CopyCheck, ThumbsUp, MessageCircle, Share2, Eye, TrendingUp, Video, type LucideIcon } from 'lucide-react';
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

interface HeyGenAvatar {
  avatarId: string;
  name: string;
  previewImageUrl: string | null;
}

interface PostEngagementStats {
  likes: number;
  comments: number;
  shares: number;
  impressions: number;
  reach: number;
  engagementRate: number;
}

const PLATFORMS: Array<'linkedin' | 'instagram' | 'facebook'> = ['linkedin', 'instagram', 'facebook'];
const IMAGES_PER_PAGE = 20;
const AVATARS_PER_PAGE = 12;

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
  const [imageUrls, setImageUrls] = useState<string[]>([]);
  const [videoScript, setVideoScript] = useState('');
  const [avatarId, setAvatarId] = useState<string | null>(null);
  const [myAvatars, setMyAvatars] = useState<HeyGenAvatar[] | null>(null);
  const [publicAvatars, setPublicAvatars] = useState<HeyGenAvatar[] | null>(null);
  const [loadingAvatars, setLoadingAvatars] = useState(false);
  const [folders, setFolders] = useState<CloudinaryFolderImages[] | null>(null);
  const [reloadingFolders, setReloadingFolders] = useState(false);
  const [expandedFolders, setExpandedFolders] = useState<Record<string, boolean>>({});
  const [folderPage, setFolderPage] = useState<Record<string, number>>({});
  const [saving, setSaving] = useState(false);
  const [savingImage, setSavingImage] = useState(false);
  const [savingAvatar, setSavingAvatar] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [idCopied, setIdCopied] = useState(false);
  const [engagement, setEngagement] = useState<PostEngagementStats | null>(null);
  const [engagementError, setEngagementError] = useState<string | null>(null);
  const [loadingEngagement, setLoadingEngagement] = useState(false);

  const editable = post ? post.status === 'draft' || post.status === 'approved' : false;

  useEffect(() => {
    if (!post) return;
    setContent(post.content);
    setScheduledDate(post.scheduled_date);
    setScheduledTime(post.scheduled_time.slice(0, 5));
    setPlatform(post.platform);
    setImageUrls(post.image_urls?.length ? post.image_urls : post.image_url ? [post.image_url] : []);
    setVideoScript(post.video_script ?? '');
    setAvatarId(post.avatar_id ?? null);
    setError(null);
    setIdCopied(false);
    setEngagement(null);
    setEngagementError(null);
  }, [post]);

  useEffect(() => {
    if (!post || post.status !== 'posted') return;
    setLoadingEngagement(true);
    fetch(`/api/dashboard/plan/${post.id}/engagement`, { cache: 'no-store' })
      .then(async res => {
        const body = await res.json();
        if (!res.ok) throw new Error(body.error ?? 'Failed to load stats.');
        setEngagement(body.engagement);
      })
      .catch(err => setEngagementError(err instanceof Error ? err.message : 'Failed to load stats.'))
      .finally(() => setLoadingEngagement(false));
  }, [post]);

  useEffect(() => {
    if (!post || !editable || post.post_type !== 'standard' || folders !== null) return;
    fetch('/api/dashboard/images')
      .then(res => res.json())
      .then(body => setFolders(body.folders ?? []))
      .catch(() => setFolders([]));
  }, [post, editable, folders]);

  useEffect(() => {
    if (!post || !editable || post.post_type !== 'video' || myAvatars !== null) return;
    setLoadingAvatars(true);
    fetch('/api/dashboard/heygen/avatars')
      .then(res => res.json())
      .then(body => {
        setMyAvatars(body.myAvatars ?? []);
        setPublicAvatars(body.publicAvatars ?? []);
      })
      .catch(() => {
        setMyAvatars([]);
        setPublicAvatars([]);
      })
      .finally(() => setLoadingAvatars(false));
  }, [post, editable, myAvatars]);

  async function reloadFolders() {
    setReloadingFolders(true);
    try {
      const res = await fetch('/api/dashboard/images');
      const body = await res.json();
      setFolders(body.folders ?? []);
    } catch {
      setFolders([]);
    } finally {
      setReloadingFolders(false);
    }
  }

  function toggleFolder(folder: string) {
    setExpandedFolders(prev => ({ ...prev, [folder]: !prev[folder] }));
  }

  function setPage(folder: string, page: number) {
    setFolderPage(prev => ({ ...prev, [folder]: page }));
  }

  // The internal post_id is what Pepe expects when asked to act on a specific
  // post (e.g. "delete post <id>") — surfacing it here means the user can
  // hand it to him directly instead of Pepe having to search for it.
  async function copyPostId() {
    if (!post?.id) return;
    await navigator.clipboard.writeText(post.id);
    setIdCopied(true);
    setTimeout(() => setIdCopied(false), 1500);
  }

  if (!post) return null;

  // Only resolved once the avatar lists have actually loaded (gated on
  // editable, same as the picker below) -- for an already-posted/failed/
  // generating post we never fetch them, so the preview falls back to
  // showing the bare avatar_id instead of pretending to have an image.
  const selectedAvatar = [...(myAvatars ?? []), ...(publicAvatars ?? [])].find(a => a.avatarId === avatarId);

  async function handleSave() {
    setSaving(true);
    setError(null);
    try {
      const body: Record<string, unknown> = { content, scheduled_date: scheduledDate, scheduled_time: scheduledTime, platform };
      if (post!.post_type === 'video') {
        body.video_script = videoScript;
      } else {
        body.image_urls = imageUrls;
      }
      const res = await fetch(`/api/dashboard/plan/${post!.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      if (!res.ok) throw new Error((await res.json().catch(() => ({}))).error ?? 'Failed to save.');
      onSaved();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to save.');
    } finally {
      setSaving(false);
    }
  }

  // Toggling an image saves immediately, independent of the Save button — otherwise
  // closing the panel right after picking silently discards the selection, since it
  // would have only lived in local state until an unrelated field was also edited.
  // Clicking an already-selected image removes it; clicking any other image adds it —
  // so a post can carry multiple images (a multi-image/carousel post) instead of only
  // ever replacing a single selection.
  async function toggleImage(url: string) {
    const previous = imageUrls;
    const next = imageUrls.includes(url) ? imageUrls.filter(u => u !== url) : [...imageUrls, url];
    setImageUrls(next);
    setSavingImage(true);
    setError(null);
    try {
      const res = await fetch(`/api/dashboard/plan/${post!.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ image_urls: next }),
      });
      if (!res.ok) throw new Error((await res.json().catch(() => ({}))).error ?? 'Failed to save image.');
      const body = await res.json();
      onPostUpdated(body.post);
    } catch (err) {
      setImageUrls(previous);
      setError(err instanceof Error ? err.message : 'Failed to save image.');
    } finally {
      setSavingImage(false);
    }
  }

  // Same immediate-save pattern as toggleImage — a different look picked and
  // then the panel closed without hitting Save shouldn't silently discard it.
  // Unlike images, an avatar is a single choice, not a set: picking one always
  // replaces the previous choice rather than toggling it off.
  async function selectAvatar(id: string) {
    const previous = avatarId;
    setAvatarId(id);
    setSavingAvatar(true);
    setError(null);
    try {
      const res = await fetch(`/api/dashboard/plan/${post!.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ avatar_id: id }),
      });
      if (!res.ok) throw new Error((await res.json().catch(() => ({}))).error ?? 'Failed to save avatar.');
      const body = await res.json();
      onPostUpdated(body.post);
    } catch (err) {
      setAvatarId(previous);
      setError(err instanceof Error ? err.message : 'Failed to save avatar.');
    } finally {
      setSavingAvatar(false);
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

  async function handleRetry() {
    setSaving(true);
    setError(null);
    try {
      const res = await fetch(`/api/dashboard/plan/${post!.id}/publish`, { method: 'POST' });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(body.error ?? 'Failed to publish.');
      onSaved();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to publish.');
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
            {post.post_type === 'video' && (
              <span title="AI avatar video" className="flex items-center gap-1 rounded-full bg-neutral-100 px-2 py-0.5 text-xs font-medium text-neutral-500 dark:bg-neutral-800 dark:text-neutral-400">
                <Video className="h-3 w-3" />
                Video
              </span>
            )}
            <h2 className="text-lg font-semibold text-neutral-900 dark:text-white">Edit post</h2>
          </div>
          <button onClick={onClose} className="rounded-lg p-1.5 text-neutral-400 hover:bg-neutral-100 dark:hover:bg-neutral-800">
            <X className="h-4 w-4" />
          </button>
        </div>

        {!editable && (
          <div className="mb-4 rounded-xl bg-neutral-100 px-3 py-2 text-sm text-neutral-600 dark:bg-neutral-800 dark:text-neutral-300">
            This post is{' '}
            <Badge tone={post.status === 'posted' ? 'positive' : post.status === 'generating' ? 'neutral' : 'negative'}>
              {post.status}
            </Badge>{' '}
            and can no longer be edited.
            {post.status === 'generating' && ' The video is rendering and will post automatically once ready.'}
            {post.post_url && (
              <a href={post.post_url} target="_blank" rel="noreferrer" className="ml-1 underline">
                View live
              </a>
            )}
          </div>
        )}

        {post.status === 'failed' && (
          <Button onClick={handleRetry} disabled={saving} className="mb-4 w-full">
            <RotateCw className="h-4 w-4" />
            {saving ? 'Retrying…' : 'Retry — publish now'}
          </Button>
        )}

        {post.status === 'posted' && (
          <div className="mb-4">
            <p className="mb-1.5 text-xs font-medium text-neutral-500">Stats</p>
            {loadingEngagement ? (
              <p className="text-xs text-neutral-400">Loading stats…</p>
            ) : engagementError ? (
              <p className="text-xs text-red-600 dark:text-red-400">{engagementError}</p>
            ) : engagement ? (
              <div className="grid grid-cols-3 gap-2">
                <StatTile icon={ThumbsUp} label="Likes" value={engagement.likes} />
                <StatTile icon={MessageCircle} label="Comments" value={engagement.comments} />
                <StatTile icon={Share2} label="Shares" value={engagement.shares} />
                <StatTile icon={Eye} label="Reach" value={engagement.reach} />
                <StatTile icon={TrendingUp} label="Impressions" value={engagement.impressions} />
                <StatTile label="Eng. rate" value={`${engagement.engagementRate.toFixed(1)}%`} />
              </div>
            ) : null}
          </div>
        )}

        {post.post_type === 'video' ? (
          selectedAvatar?.previewImageUrl ? (
            <div className="relative mb-4">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={selectedAvatar.previewImageUrl} alt={selectedAvatar.name} className="h-40 w-full rounded-xl object-cover" />
              <span className="absolute inset-x-0 bottom-0 flex items-center gap-1 rounded-b-xl bg-black/50 px-2 py-1 text-xs text-white">
                <Video className="h-3 w-3" />
                {selectedAvatar.name}
              </span>
            </div>
          ) : (
            <div className="mb-4 flex h-40 w-full flex-col items-center justify-center gap-1.5 rounded-xl border border-dashed border-neutral-200 text-neutral-400 dark:border-neutral-800 dark:text-neutral-600">
              <Video className="h-5 w-5" />
              <span className="text-xs">
                {avatarId
                  ? loadingAvatars
                    ? 'Loading avatar preview…'
                    : `Avatar: ${avatarId}`
                  : 'AI avatar video (HeyGen) — account default avatar'}
              </span>
            </div>
          )
        ) : imageUrls.length === 1 ? (
          <div className="relative mb-4">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={imageUrls[0]} alt="Selected" className="h-40 w-full rounded-xl object-cover" />
            {editable && (
              <button
                type="button"
                onClick={() => toggleImage(imageUrls[0])}
                disabled={savingImage}
                title="Remove image"
                className="absolute right-1.5 top-1.5 flex h-6 w-6 items-center justify-center rounded-full bg-red-600 text-white transition hover:bg-red-700 disabled:opacity-60"
              >
                <Trash2 className="h-3.5 w-3.5" />
              </button>
            )}
          </div>
        ) : imageUrls.length > 1 ? (
          <div className="mb-4 grid grid-cols-4 gap-1.5">
            {imageUrls.map(url => (
              <div key={url} className="relative">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={url} alt="Selected" className="aspect-square w-full rounded-lg object-cover" />
                {editable && (
                  <button
                    type="button"
                    onClick={() => toggleImage(url)}
                    disabled={savingImage}
                    title="Remove image"
                    className="absolute right-1 top-1 flex h-5 w-5 items-center justify-center rounded-full bg-red-600 text-white transition hover:bg-red-700 disabled:opacity-60"
                  >
                    <Trash2 className="h-3 w-3" />
                  </button>
                )}
              </div>
            ))}
          </div>
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

          {post.post_type === 'video' && (
            <div>
              <label className="mb-1.5 block text-xs font-medium text-neutral-500">Video script (what the avatar says)</label>
              <textarea
                value={videoScript}
                onChange={e => setVideoScript(e.target.value)}
                disabled={!editable}
                rows={5}
                className="w-full rounded-xl border border-neutral-200 bg-neutral-50 px-3 py-2 text-sm outline-none focus:border-neutral-400 disabled:opacity-60 dark:border-neutral-700 dark:bg-neutral-800 dark:text-white"
              />
            </div>
          )}

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
              {(post.post_type === 'video' ? PLATFORMS.filter(p => p !== 'linkedin') : PLATFORMS).map(p => (
                <option key={p} value={p}>
                  {p}
                </option>
              ))}
            </select>
            {post.post_type === 'video' && (
              <p className="mt-1 text-xs text-neutral-400">Video posts only support Instagram or Facebook.</p>
            )}
            <button
              type="button"
              onClick={copyPostId}
              title="Copy post ID — hand this to Pepe to look up or act on this post directly"
              className="mt-1.5 flex items-center gap-1 font-mono text-xs text-neutral-400 hover:text-neutral-600 dark:hover:text-neutral-300"
            >
              {idCopied ? <CopyCheck className="h-3 w-3" /> : <Copy className="h-3 w-3" />}
              {post.id}
            </button>
          </div>

          {editable && post.post_type === 'video' && (
            <div>
              <label className="mb-1.5 flex items-center gap-1.5 text-xs font-medium text-neutral-500">
                <Video className="h-3.5 w-3.5" />
                Avatar{savingAvatar && <span className="font-normal text-neutral-400">Saving…</span>}
              </label>
              <p className="mb-1.5 text-xs text-neutral-400">Click a look to use it for this post. Leave unset to use the account default.</p>
              {loadingAvatars ? (
                <p className="text-xs text-neutral-400">Loading avatars…</p>
              ) : (
                <div className="space-y-3">
                  <AvatarGroupPicker
                    label="My Avatars"
                    avatars={myAvatars ?? []}
                    selectedId={avatarId}
                    saving={savingAvatar}
                    onSelect={selectAvatar}
                    emptyText="No custom avatars on this HeyGen account."
                  />
                  <AvatarGroupPicker
                    label="Public Avatars"
                    avatars={publicAvatars ?? []}
                    selectedId={avatarId}
                    saving={savingAvatar}
                    onSelect={selectAvatar}
                    emptyText="No public avatars found."
                  />
                </div>
              )}
            </div>
          )}

          {editable && post.post_type !== 'video' && (
            <div>
              <label className="mb-1.5 flex items-center gap-1.5 text-xs font-medium text-neutral-500">
                <ImageIcon className="h-3.5 w-3.5" />
                Image{imageUrls.length > 1 ? `s (${imageUrls.length} selected)` : ''}
                {savingImage && <span className="font-normal text-neutral-400">Saving…</span>}
                <button
                  type="button"
                  onClick={reloadFolders}
                  disabled={reloadingFolders}
                  title="Reload Cloudinary folders"
                  className="ml-auto flex items-center gap-1 text-neutral-400 hover:text-neutral-600 disabled:opacity-60 dark:hover:text-neutral-300"
                >
                  <RotateCw className={cn('h-3 w-3', reloadingFolders && 'animate-spin')} />
                </button>
              </label>
              <p className="mb-1.5 text-xs text-neutral-400">Click an image to select it; click again to remove it. Select more than one for a multi-image/carousel post.</p>
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
                                  {pageImages.map(img => {
                                    const selectedIndex = imageUrls.indexOf(img.url);
                                    return (
                                      <div key={img.id} className="relative">
                                        {/* eslint-disable-next-line @next/next/no-img-element */}
                                        <img
                                          src={img.url}
                                          alt={img.name}
                                          onClick={() => toggleImage(img.url)}
                                          className={cn(
                                            savingImage && 'pointer-events-none opacity-60',
                                            'aspect-square w-full cursor-pointer rounded-lg object-cover ring-2 ring-transparent transition hover:opacity-80',
                                            selectedIndex !== -1 && 'ring-neutral-900 dark:ring-white'
                                          )}
                                        />
                                        {selectedIndex !== -1 && (
                                          <span className="absolute right-1 top-1 flex h-4 w-4 items-center justify-center rounded-full bg-neutral-900 text-[10px] font-medium text-white dark:bg-white dark:text-neutral-900">
                                            {selectedIndex + 1}
                                          </span>
                                        )}
                                      </div>
                                    );
                                  })}
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

function StatTile({
  icon: Icon,
  label,
  value,
}: {
  icon?: LucideIcon;
  label: string;
  value: number | string;
}) {
  return (
    <div className="rounded-lg border border-neutral-200 bg-neutral-50 px-2 py-1.5 dark:border-neutral-700 dark:bg-neutral-800">
      <div className="flex items-center gap-1 text-[10px] font-medium uppercase tracking-wide text-neutral-400">
        {Icon && <Icon className="h-3 w-3" />}
        {label}
      </div>
      <p className="mt-0.5 text-sm font-semibold tabular-nums text-neutral-900 dark:text-white">{value}</p>
    </div>
  );
}

function AvatarGroupPicker({
  label,
  avatars,
  selectedId,
  saving,
  onSelect,
  emptyText,
}: {
  label: string;
  avatars: HeyGenAvatar[];
  selectedId: string | null;
  saving: boolean;
  onSelect: (id: string) => void;
  emptyText: string;
}) {
  const [page, setPage] = useState(0);
  const totalPages = Math.max(1, Math.ceil(avatars.length / AVATARS_PER_PAGE));
  // The public HeyGen library alone can run into the hundreds -- there's no
  // page/limit query param on their end to ask for just one page (GET
  // /v2/avatars takes no parameters), so the underlying fetch always pulls
  // the full metadata list. What this actually saves is the expensive part:
  // only the current page's <img> tags exist in the DOM, so the browser
  // never requests preview images for avatars that aren't shown yet.
  const clampedPage = Math.min(page, totalPages - 1);
  const pageAvatars = avatars.slice(clampedPage * AVATARS_PER_PAGE, clampedPage * AVATARS_PER_PAGE + AVATARS_PER_PAGE);

  return (
    <div>
      <p className="mb-1 text-[11px] font-medium uppercase tracking-wide text-neutral-400">{label}</p>
      {avatars.length === 0 ? (
        <p className="text-xs text-neutral-400">{emptyText}</p>
      ) : (
        <div className="grid grid-cols-3 gap-2">
          {pageAvatars.map(a => (
            <div key={a.avatarId} className="relative">
              {a.previewImageUrl ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={a.previewImageUrl}
                  alt={a.name}
                  title={a.name}
                  onClick={() => onSelect(a.avatarId)}
                  className={cn(
                    saving && 'pointer-events-none opacity-60',
                    'aspect-square w-full cursor-pointer rounded-lg object-cover ring-2 ring-transparent transition hover:opacity-80',
                    selectedId === a.avatarId && 'ring-neutral-900 dark:ring-white'
                  )}
                />
              ) : (
                <button
                  type="button"
                  onClick={() => onSelect(a.avatarId)}
                  disabled={saving}
                  title={a.name}
                  className={cn(
                    'flex aspect-square w-full items-center justify-center rounded-lg border border-neutral-200 bg-neutral-50 text-center text-[10px] text-neutral-500 ring-2 ring-transparent transition hover:opacity-80 disabled:opacity-60 dark:border-neutral-700 dark:bg-neutral-800',
                    selectedId === a.avatarId && 'ring-neutral-900 dark:ring-white'
                  )}
                >
                  {a.name}
                </button>
              )}
              {selectedId === a.avatarId && (
                <span className="absolute right-1 top-1 flex h-4 w-4 items-center justify-center rounded-full bg-neutral-900 text-white dark:bg-white dark:text-neutral-900">
                  <Check className="h-2.5 w-2.5" />
                </span>
              )}
            </div>
          ))}
        </div>
      )}
      {totalPages > 1 && (
        <div className="mt-2 flex items-center justify-between text-xs text-neutral-500 dark:text-neutral-400">
          <button
            type="button"
            onClick={() => setPage(p => Math.max(0, p - 1))}
            disabled={clampedPage === 0}
            className="flex items-center gap-1 rounded-lg px-2 py-1 disabled:opacity-40 hover:bg-neutral-100 dark:hover:bg-neutral-800"
          >
            <ChevronLeft className="h-3.5 w-3.5" />
            Prev
          </button>
          <span>
            {clampedPage * AVATARS_PER_PAGE + 1}–{Math.min((clampedPage + 1) * AVATARS_PER_PAGE, avatars.length)} of {avatars.length}
          </span>
          <button
            type="button"
            onClick={() => setPage(p => Math.min(totalPages - 1, p + 1))}
            disabled={clampedPage >= totalPages - 1}
            className="flex items-center gap-1 rounded-lg px-2 py-1 disabled:opacity-40 hover:bg-neutral-100 dark:hover:bg-neutral-800"
          >
            Next
            <ChevronRight className="h-3.5 w-3.5" />
          </button>
        </div>
      )}
    </div>
  );
}
