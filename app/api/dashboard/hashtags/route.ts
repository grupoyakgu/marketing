import { NextResponse } from 'next/server';
import { addTrackedHashtag } from '@/lib/instagram-hashtags';

export async function POST(req: Request) {
  const body = await req.json().catch(() => null);
  const tag = typeof body?.tag === 'string' ? body.tag : null;
  if (!tag) return NextResponse.json({ error: 'tag is required.' }, { status: 400 });

  const result = await addTrackedHashtag(tag);
  if ('error' in result) return NextResponse.json({ error: result.error }, { status: 400 });
  return NextResponse.json({ ok: true, hashtag: result });
}
