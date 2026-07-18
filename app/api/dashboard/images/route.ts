import { NextResponse } from 'next/server';
import { listCloudinaryImages } from '@/lib/cloudinary';

export const dynamic = 'force-dynamic';

export async function GET() {
  try {
    const images = await listCloudinaryImages();
    return NextResponse.json({ images });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Failed to load images.' },
      { status: 502 }
    );
  }
}
