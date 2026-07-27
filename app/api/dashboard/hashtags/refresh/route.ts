import { NextResponse } from 'next/server';
import { refreshTrackedHashtags } from '@/lib/instagram-hashtags';

export async function POST() {
  try {
    const result = await refreshTrackedHashtags();
    return NextResponse.json({ result });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Refresh failed.' },
      { status: 502 }
    );
  }
}
