import { NextResponse } from 'next/server';
import { listUsers, createUser, getUserByUsername, getUserByEmail, type UserRole } from '@/lib/users';
import { hashPassword } from '@/lib/auth';

// middleware.ts already restricts /api/admin/* to authenticated admins.

export async function GET() {
  const users = await listUsers();
  return NextResponse.json({ users });
}

export async function POST(req: Request) {
  const { username, password, role, email } = await req.json();
  if (typeof username !== 'string' || typeof password !== 'string' || !username || !password) {
    return NextResponse.json({ error: 'Username and password are required.' }, { status: 400 });
  }
  const resolvedRole: UserRole = role === 'admin' || role === 'demo' ? role : 'user';
  const resolvedEmail = typeof email === 'string' && email.trim() ? email.trim() : null;

  if (await getUserByUsername(username)) {
    return NextResponse.json({ error: 'That username is already taken.' }, { status: 409 });
  }
  if (resolvedEmail && (await getUserByEmail(resolvedEmail))) {
    return NextResponse.json({ error: 'That email is already in use.' }, { status: 409 });
  }

  const hash = await hashPassword(password);
  const user = await createUser(username, hash, resolvedRole, resolvedEmail);
  return NextResponse.json({ user }, { status: 201 });
}
