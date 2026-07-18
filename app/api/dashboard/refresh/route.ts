import { NextResponse } from 'next/server';
import { refreshDashboardData } from '@/lib/dashboard-refresh';
import { getRefreshStatus } from '@/lib/engagement';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

export async function GET() {
  const status = await getRefreshStatus();
  return NextResponse.json({ status }, { headers: { 'Cache-Control': 'no-store, must-revalidate' } });
}

export async function POST() {
  const result = await refreshDashboardData();
  return NextResponse.json({ result }, { headers: { 'Cache-Control': 'no-store, must-revalidate' } });
}
