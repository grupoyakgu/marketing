import { NextRequest, NextResponse } from 'next/server';
import { verifySessionToken, SESSION_COOKIE_NAME } from '@/lib/session';

// Positive matcher: only the new dashboard UI + its API routes go through this
// middleware. Existing bot/cron routes (/api/telegram, /api/cron/*, etc.) are
// never matched, so they're untouched by the new auth layer.
export const config = {
  matcher: [
    '/',
    '/settings/:path*',
    '/planner/:path*',
    '/comments/:path*',
    '/interactions',
    '/interactions/:path*',
    '/ads/:path*',
    '/hashtags/:path*',
    '/landing-performance/:path*',
    '/landing-performance',
    '/costs/:path*',
    '/costs',
    '/api/dashboard/:path*',
    '/api/admin/:path*',
  ],
};

// Sections a 'demo' user can't reach at all -- redirected away from (pages)
// or 403'd (their APIs), not just unlinked in the sidebar, since a demo
// session is otherwise a normal authenticated session that could hit these
// routes directly.
const DEMO_HIDDEN_PREFIXES = [
  '/settings',
  '/costs',
  '/hashtags',
  '/interactions',
  '/api/dashboard/refresh',
  '/api/dashboard/costs',
  '/api/dashboard/hashtags',
  '/api/dashboard/interactions',
];

export async function middleware(req: NextRequest) {
  const token = req.cookies.get(SESSION_COOKIE_NAME)?.value;
  const session = token ? await verifySessionToken(token) : null;
  const isApi = req.nextUrl.pathname.startsWith('/api/');

  if (!session) {
    if (isApi) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    return NextResponse.redirect(new URL('/login', req.url));
  }

  const isAdminRoute =
    req.nextUrl.pathname.startsWith('/settings/users') ||
    req.nextUrl.pathname.startsWith('/settings/crons') ||
    req.nextUrl.pathname.startsWith('/api/admin');
  if (isAdminRoute && session.role !== 'admin') {
    if (isApi) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    return NextResponse.redirect(new URL('/', req.url));
  }

  if (session.role === 'demo') {
    const isHidden = DEMO_HIDDEN_PREFIXES.some(
      prefix => req.nextUrl.pathname === prefix || req.nextUrl.pathname.startsWith(`${prefix}/`)
    );
    if (isHidden) {
      if (isApi) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
      return NextResponse.redirect(new URL('/', req.url));
    }
    // Everything else is view-only: demo can load any dashboard API to see
    // data, but never mutate it.
    if (isApi && req.method !== 'GET' && req.method !== 'HEAD') {
      return NextResponse.json({ error: 'Demo accounts are read-only.' }, { status: 403 });
    }
  }

  return NextResponse.next();
}
