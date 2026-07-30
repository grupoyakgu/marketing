'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { MessageSquare } from 'lucide-react';

const POLL_MS = 60_000;

/** Comment icon shown in the header only while comment_log has an entry
 * newer than the last time the user opened /comments — cleared there via
 * markCommentsViewed(). Hidden entirely (not just the dot) once there's
 * nothing unviewed. Polls rather than pushing since this is a low-value,
 * low-frequency signal not worth a websocket/SSE connection for. */
export function UnviewedCommentsButton() {
  const [hasUnread, setHasUnread] = useState(false);

  useEffect(() => {
    let cancelled = false;

    function check() {
      fetch('/api/dashboard/comments/unread')
        .then(res => res.json())
        .then(body => { if (!cancelled) setHasUnread(!!body.hasUnread); })
        .catch(() => {});
    }

    check();
    const interval = setInterval(check, POLL_MS);
    return () => { cancelled = true; clearInterval(interval); };
  }, []);

  if (!hasUnread) return null;

  return (
    <Link
      href="/comments"
      aria-label="New comments waiting to be viewed"
      className="relative rounded-lg p-2 text-neutral-500 transition hover:bg-neutral-100 hover:text-neutral-900 dark:text-neutral-400 dark:hover:bg-neutral-800 dark:hover:text-white"
    >
      <MessageSquare className="h-4 w-4" />
      <span className="absolute right-0.5 top-0.5 h-2 w-2 rounded-full bg-red-500 ring-2 ring-white dark:ring-neutral-900" />
    </Link>
  );
}
