import { NextResponse } from 'next/server';
import { setCronEnabled } from '@/lib/cron-settings';

// middleware.ts already restricts /api/admin/* to authenticated admins.
export const dynamic = 'force-dynamic';

export async function PATCH(req: Request, { params }: { params: { id: string } }) {
  const body = await req.json();
  if (typeof body.enabled !== 'boolean') {
    return NextResponse.json({ error: 'enabled must be a boolean.' }, { status: 400 });
  }
  await setCronEnabled(params.id, body.enabled);
  return NextResponse.json({ ok: true });
}
