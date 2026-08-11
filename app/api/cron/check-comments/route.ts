import { NextResponse } from 'next/server';
import { runCommentCheck } from '@/lib/comment-check';
import { isCronEnabled } from '@/lib/cron-settings';

export const dynamic = 'force-dynamic';
export const maxDuration = 300;

export async function GET(req: Request) {
  if (
    process.env.CRON_SECRET &&
    req.headers.get('authorization') !== `Bearer ${process.env.CRON_SECRET}`
  ) {
    return new NextResponse('Unauthorized', { status: 401 });
  }
  if (!(await isCronEnabled('check-comments'))) {
    return NextResponse.json({ skipped: 'disabled' });
  }

  const result = await runCommentCheck();
  return NextResponse.json(result);
}
