import { NextResponse } from 'next/server';
import { listAvatars, listMyAvatars } from '@/lib/heygen';

export const dynamic = 'force-dynamic';

export async function GET() {
  try {
    const [myAvatars, publicAvatars] = await Promise.all([listMyAvatars(), listAvatars()]);
    return NextResponse.json({ myAvatars, publicAvatars });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Failed to load avatars.' },
      { status: 502 }
    );
  }
}
