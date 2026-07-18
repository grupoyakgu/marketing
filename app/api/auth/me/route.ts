import { NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { verifySessionToken, SESSION_COOKIE_NAME } from '@/lib/session';

export async function GET() {
  const token = cookies().get(SESSION_COOKIE_NAME)?.value;
  const session = token ? await verifySessionToken(token) : null;
  if (!session) return NextResponse.json({ user: null });
  return NextResponse.json({ user: { id: session.sub, username: session.username, role: session.role } });
}
