'use client';

import { useEffect } from 'react';
import type { Locale } from './copy';

export function PageViewTracker({ locale }: { locale: Locale }) {
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    fetch('/api/events/pageview', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        landing_page: 'bds36',
        locale,
        utm_source: params.get('utm_source') ?? undefined,
        utm_medium: params.get('utm_medium') ?? undefined,
        utm_campaign: params.get('utm_campaign') ?? undefined,
      }),
    }).catch(() => {
      // Best-effort — never surface tracking errors to the visitor
    });
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  return null;
}
