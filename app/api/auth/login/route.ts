import { NextResponse } from 'next/server';
import { ensureAdminSeeded, verifyPassword } from '@/lib/auth';
import { getUserByUsername } from '@/lib/users';
import { createSessionToken, SESSION_COOKIE_NAME, SESSION_MAX_AGE } from '@/lib/session';

export async function POST(req: Request) {
  const { username, password } = await req.json();
  if (typeof username !== 'string' || typeof password !== 'string' || !username || !password) {
    return NextResponse.json({ error: 'Username and password are required.' }, { status: 400 });
  }

  await ensureAdminSeeded();

  const user = await getUserByUsername(username);
  if (!user || user.disabled || !(await verifyPassword(password, user.password_hash))) {
    return NextResponse.json({ error: 'Invalid username or password.' }, { status: 401 });
  }

  const token = await createSessionToken({ sub: user.id, username: user.username, role: user.role });

  const res = NextResponse.json({
    user: { id: user.id, username: user.username, role: user.role },
  });
  res.cookies.set(SESSION_COOKIE_NAME, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    maxAge: SESSION_MAX_AGE,
    path: '/',
  });
  return res;
}
