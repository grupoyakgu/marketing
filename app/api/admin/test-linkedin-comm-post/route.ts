import { NextResponse } from 'next/server';
import { postToLinkedIn } from '@/lib/linkedin-poster';

// middleware.ts already restricts /api/admin/* to authenticated admins.
//
// One-off test route: confirms whether the Community Management app's token
// (LINKEDIN_ACCESS_TOKEN_COMM/LINKEDIN_AUTHOR_ID_COMM) can create a
// top-level UGC post, same as the original posting app already does via
// postToLinkedIn's default credentials. Delete this route once confirmed —
// it exists only to answer that one question without touching the working
// posting pipeline used by the weekly post-schedule cron.

export async function POST(req: Request) {
  const { text } = await req.json().catch(() => ({ text: undefined }));
  if (typeof text !== 'string' || !text.trim()) {
    return NextResponse.json({ error: 'Provide a non-empty "text" field.' }, { status: 400 });
  }

  const token = process.env.LINKEDIN_ACCESS_TOKEN_COMM;
  const authorId = process.env.LINKEDIN_AUTHOR_ID_COMM;
  if (!token || !authorId) {
    return NextResponse.json({ error: 'LINKEDIN_ACCESS_TOKEN_COMM or LINKEDIN_AUTHOR_ID_COMM not configured.' }, { status: 400 });
  }

  const result = await postToLinkedIn(text, undefined, { token, authorId });
  return NextResponse.json(result, { status: result.success ? 200 : 502 });
}
