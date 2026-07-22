import { NextResponse } from 'next/server';
import { resumeCampaign } from '@/lib/meta-ads';

export async function POST(_req: Request, { params }: { params: { id: string } }) {
  const result = await resumeCampaign(params.id);
  if (!result.success) {
    return NextResponse.json({ error: result.error }, { status: 400 });
  }
  return NextResponse.json({ ok: true });
}
