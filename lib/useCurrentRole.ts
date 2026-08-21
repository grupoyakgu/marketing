'use client';

import { useEffect, useState } from 'react';

// Client components rendered inside pages that stay visible to a 'demo'
// user (Planner, Ads, ...) need to know the role to hide/disable the
// mutating controls those pages have -- the server layout already knows
// the session, but there's no prop-drilling path from it down through
// {children} into a deeply nested client component, so this fetches the
// same session via /api/auth/me instead. This is a UX nicety only:
// middleware.ts's read-only enforcement is what actually blocks a demo
// write if this hasn't resolved yet or a request bypasses the UI.
export function useCurrentRole(): string | null {
  const [role, setRole] = useState<string | null>(null);

  useEffect(() => {
    fetch('/api/auth/me')
      .then(res => res.json())
      .then(body => setRole(body.user?.role ?? null))
      .catch(() => {});
  }, []);

  return role;
}
