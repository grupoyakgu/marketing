import { NextResponse } from 'next/server';
import { removeTopic } from '@/lib/interactions';

export async function DELETE(_req: Request, { params }: { params: { id: string } }) {
  try {
    await removeTopic(params.id);
    return NextResponse.json({ ok: true });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Failed to remove topic.' },
      { status: 400 }
    );
  }
}
