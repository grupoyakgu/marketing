import { NextResponse } from 'next/server';
import { publishPost } from '@/lib/publish-post';

export async function POST(_req: Request, { params }: { params: { id: string } }) {
  const result = await publishPost(params.id);
  if (!result.success) {
    return NextResponse.json({ error: result.error }, { status: 400 });
  }
  return NextResponse.json({ ok: true });
}
