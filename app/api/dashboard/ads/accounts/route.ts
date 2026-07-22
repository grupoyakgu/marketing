import { NextResponse } from 'next/server';
import { listConfiguredAdAccounts } from '@/lib/meta-ads';

export const dynamic = 'force-dynamic';

export async function GET() {
  try {
    const accounts = await listConfiguredAdAccounts();
    return NextResponse.json(
      { accounts },
      { headers: { 'Cache-Control': 'no-store, must-revalidate' } }
    );
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Failed to load ad accounts.' },
      { status: 502 }
    );
  }
}
