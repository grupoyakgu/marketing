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
    '/ads/:path*',
    '/api/dashboard/:path*',
    '/api/admin/:path*',
  ],
};

export async function middleware(req: NextRequest) {
  const token = req.cookies.get(SESSION_COOKIE_NAME)?.value;
  const session = token ? await verifySessionToken(token) : null;
  const isApi = req.nextUrl.pathname.startsWith('/api/');

  if (!session) {
    if (isApi) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    return NextResponse.redirect(new URL('/login', req.url));
  }

  const isAdminRoute =
    req.nextUrl.pathname.startsWith('/settings/users') || req.nextUrl.pathname.startsWith('/api/admin');
  if (isAdminRoute && session.role !== 'admin') {
    if (isApi) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    return NextResponse.redirect(new URL('/', req.url));
  }

  return NextResponse.next();
}
