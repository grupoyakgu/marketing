import { NextRequest, NextResponse } from 'next/server';

export const maxDuration = 30;

export async function GET(req: NextRequest) {
  const fileId = req.nextUrl.searchParams.get('id');
  if (!fileId) return new NextResponse('Missing id', { status: 400 });

  const apiKey = process.env.GOOGLE_DRIVE_API_KEY;
  if (!apiKey) return new NextResponse('Not configured', { status: 500 });

  const res = await fetch(
    `https://www.googleapis.com/drive/v3/files/${fileId}?alt=media&key=${apiKey}`
  );

  if (!res.ok) return new NextResponse('Failed to fetch image', { status: 502 });

  const contentType = res.headers.get('content-type') ?? 'image/jpeg';
  const data = await res.arrayBuffer();

  return new NextResponse(data, {
    headers: {
      'Content-Type': contentType,
      'Cache-Control': 'public, max-age=3600',
    },
  });
}
