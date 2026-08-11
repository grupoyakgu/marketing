import { NextResponse } from 'next/server';
import { listCronSettings } from '@/lib/cron-settings';

// middleware.ts already restricts /api/admin/* to authenticated admins.

export async function GET() {
  const crons = await listCronSettings();
  return NextResponse.json({ crons });
}
