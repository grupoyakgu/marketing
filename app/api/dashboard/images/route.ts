import { NextResponse } from 'next/server';
import { listCloudinaryImagesByFolder } from '@/lib/cloudinary';

export const dynamic = 'force-dynamic';

export async function GET() {
  try {
    const folders = await listCloudinaryImagesByFolder();
    console.log(`[dashboard/images GET] folders=${JSON.stringify(folders.map(f => ({ folder: f.folder, count: f.images.length })))}`);
    return NextResponse.json({ folders });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Failed to load images.' },
      { status: 502 }
    );
  }
}
