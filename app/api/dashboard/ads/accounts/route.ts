import { NextResponse } from 'next/server';
import { listConfiguredAdAccounts, setAdAccountLabel } from '@/lib/meta-ads';

export const dynamic = 'force-dynamic';

export async function GET() {
  try {
    const accounts = await listConfiguredAdAccounts();
    return NextResponse.json(
      { accounts },
      { headers: { 'Cache-Control': 'no-store, must-revalidate' } }
    );
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Failed to load ad accounts.' },
      { status: 502 }
    );
  }
}

export async function PATCH(req: Request) {
  const body = await req.json().catch(() => null);
  const accountId = typeof body?.accountId === 'string' ? body.accountId : null;
  const label = typeof body?.label === 'string' ? body.label : null;
  if (!accountId || !label) {
    return NextResponse.json({ error: 'accountId and label are required.' }, { status: 400 });
  }

  try {
    await setAdAccountLabel(accountId, label);
    return NextResponse.json({ ok: true });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Failed to save label.' },
      { status: 400 }
    );
  }
}
