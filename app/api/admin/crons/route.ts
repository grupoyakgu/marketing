import { NextResponse } from 'next/server';
import { listCronSettings } from '@/lib/cron-settings';

// middleware.ts already restricts /api/admin/* to authenticated admins.
// force-dynamic: the Supabase client forces cache: 'no-store' on every
// fetch (see lib/supabase.ts), which Next.js treats as dynamic server
// usage and fails the build if it tries to statically prerender this route.
export const dynamic = 'force-dynamic';

export async function GET() {
  const crons = await listCronSettings();
  return NextResponse.json({ crons });
}
