import { NextResponse } from 'next/server';
import { pauseCampaign } from '@/lib/meta-ads';

export async function POST(_req: Request, { params }: { params: { id: string } }) {
  const result = await pauseCampaign(params.id);
  if (!result.success) {
    return NextResponse.json({ error: result.error }, { status: 400 });
  }
  return NextResponse.json({ ok: true });
}
