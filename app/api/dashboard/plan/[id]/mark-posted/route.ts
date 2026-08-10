import { NextResponse } from 'next/server';
import { markPostStatus } from '@/lib/marketing-plan';

/** Marks a post as "posted" in the DB without triggering any publishing action.
 * Used to reconcile posts that were published manually (outside the cron)
 * and then retroactively logged in the planner. */
export async function POST(_req: Request, { params }: { params: { id: string } }) {
  try {
    await markPostStatus(params.id, 'posted');
    return NextResponse.json({ ok: true });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Failed to mark post as posted.' },
      { status: 400 }
    );
  }
}
