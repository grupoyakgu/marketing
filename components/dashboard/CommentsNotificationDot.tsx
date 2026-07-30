'use client';

import { useEffect, useState } from 'react';

const POLL_MS = 60_000;

/** Small red dot shown in the header while comment_log has an entry newer
 * than the last time the user opened /comments — cleared there via
 * markCommentsViewed(). Polls rather than pushing since this is a low-value,
 * low-frequency signal not worth a websocket/SSE connection for. */
export function CommentsNotificationDot() {
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
    <span
      aria-label="New comments waiting to be viewed"
      className="absolute right-0.5 top-0.5 h-2 w-2 rounded-full bg-red-500 ring-2 ring-white dark:ring-neutral-900"
    />
  );
}
