import { NextResponse } from 'next/server';
import { runCommentCheck } from '@/lib/comment-check';

export const dynamic = 'force-dynamic';
export const maxDuration = 300;

export async function GET(req: Request) {
  if (
    process.env.CRON_SECRET &&
    req.headers.get('authorization') !== `Bearer ${process.env.CRON_SECRET}`
  ) {
    return new NextResponse('Unauthorized', { status: 401 });
  }

  const result = await runCommentCheck();
  return NextResponse.json(result);
}
