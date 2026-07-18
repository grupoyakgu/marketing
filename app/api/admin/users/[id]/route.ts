import { NextResponse } from 'next/server';
import { setUserDisabled, setUserRole, setUserPassword, deleteUser, type UserRole } from '@/lib/users';
import { hashPassword } from '@/lib/auth';
import { getServerSession } from '@/lib/server-session';

export async function PATCH(req: Request, { params }: { params: { id: string } }) {
  const session = await getServerSession();
  const body = await req.json();

  if (params.id === session?.sub && (body.disabled === true || body.role === 'user')) {
    return NextResponse.json({ error: 'You cannot disable or demote your own account.' }, { status: 400 });
  }

  if (typeof body.disabled === 'boolean') {
    await setUserDisabled(params.id, body.disabled);
  }
  if (body.role === 'admin' || body.role === 'user') {
    await setUserRole(params.id, body.role as UserRole);
  }
  if (typeof body.password === 'string' && body.password.length > 0) {
    await setUserPassword(params.id, await hashPassword(body.password));
  }

  return NextResponse.json({ ok: true });
}

export async function DELETE(_req: Request, { params }: { params: { id: string } }) {
  const session = await getServerSession();
  if (params.id === session?.sub) {
    return NextResponse.json({ error: 'You cannot delete your own account.' }, { status: 400 });
  }
  await deleteUser(params.id);
  return NextResponse.json({ ok: true });
}
