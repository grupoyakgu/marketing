import { NextResponse } from 'next/server';
import { getUserByUsername, getUserByEmail } from '@/lib/users';
import { createPasswordResetToken } from '@/lib/password-reset';
import { sendEmail } from '@/lib/gmail';

// Always returns a generic success response, whether or not the
// username/email matched a user with an email on file -- this endpoint must
// not let a caller enumerate valid usernames/emails.
export async function POST(req: Request) {
  const { identifier } = await req.json();
  if (typeof identifier !== 'string' || !identifier.trim()) {
    return NextResponse.json({ error: 'Enter your username or email.' }, { status: 400 });
  }

  const trimmed = identifier.trim();
  const user = trimmed.includes('@') ? await getUserByEmail(trimmed) : await getUserByUsername(trimmed);

  if (user && !user.disabled && user.email) {
    const token = await createPasswordResetToken(user.id);
    const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? 'https://marketing-grupo-yakgu.vercel.app';
    const resetUrl = `${appUrl}/reset-password?token=${token}`;
    await sendEmail(
      user.email,
      'Reset your dashboard password',
      `Hi ${user.username},\n\nA password reset was requested for your Grupo Yakgu dashboard account. Click the link below to set a new password:\n\n${resetUrl}\n\nThis link expires in 1 hour. If you didn't request this, you can ignore this email.`
    );
  }

  return NextResponse.json({ ok: true });
}
