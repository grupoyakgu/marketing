import { NextResponse } from 'next/server';
import { approvePost } from '@/lib/marketing-plan';

export async function POST(_req: Request, { params }: { params: { id: string } }) {
  await approvePost(params.id);
  return NextResponse.json({ ok: true });
}
