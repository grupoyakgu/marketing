import { NextResponse } from 'next/server';
import { markPostDone, deletePost } from '@/lib/interactions';

export async function PATCH(req: Request, { params }: { params: { id: string } }) {
  const body = await req.json().catch(() => ({}));
  if (body.status !== 'done') {
    return NextResponse.json({ error: 'Only {"status":"done"} is supported.' }, { status: 400 });
  }
  try {
    const post = await markPostDone(params.id);
    return NextResponse.json({ post });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Failed to update post.' },
      { status: 400 }
    );
  }
}

export async function DELETE(_req: Request, { params }: { params: { id: string } }) {
  try {
    // deletePost also queues a replacement fetch request for the post's
    // platform if this drop takes it below the daily target.
    await deletePost(params.id);
    return NextResponse.json({ ok: true });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Failed to remove post.' },
      { status: 400 }
    );
  }
}
