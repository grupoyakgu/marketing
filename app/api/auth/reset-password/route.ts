import { NextResponse } from 'next/server';
import { consumePasswordResetToken } from '@/lib/password-reset';
import { setUserPassword } from '@/lib/users';
import { hashPassword } from '@/lib/auth';

export async function POST(req: Request) {
  const { token, password } = await req.json();
  if (typeof token !== 'string' || !token || typeof password !== 'string' || password.length < 8) {
    return NextResponse.json({ error: 'A new password of at least 8 characters is required.' }, { status: 400 });
  }

  const consumed = await consumePasswordResetToken(token);
  if (!consumed) {
    return NextResponse.json({ error: 'This reset link is invalid or has expired.' }, { status: 400 });
  }

  await setUserPassword(consumed.userId, await hashPassword(password));
  return NextResponse.json({ ok: true });
}
