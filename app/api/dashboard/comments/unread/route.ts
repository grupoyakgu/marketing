import { NextResponse } from 'next/server';
import { hasUnviewedComments } from '@/lib/social-comments';

export const dynamic = 'force-dynamic';

export async function GET() {
  const hasUnread = await hasUnviewedComments();
  return NextResponse.json({ hasUnread });
}
