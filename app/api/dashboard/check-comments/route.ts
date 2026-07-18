import { NextResponse } from 'next/server';
import { runCommentCheck } from '@/lib/comment-check';
import { getCommentCheckStatus } from '@/lib/social-comments';
import { revalidatePath } from 'next/cache';

export const dynamic = 'force-dynamic';
export const maxDuration = 300;

export async function GET() {
  const status = await getCommentCheckStatus();
  return NextResponse.json({ status }, { headers: { 'Cache-Control': 'no-store, must-revalidate' } });
}

export async function POST() {
  const result = await runCommentCheck();
  revalidatePath('/comments');
  return NextResponse.json({ result }, { headers: { 'Cache-Control': 'no-store, must-revalidate' } });
}
