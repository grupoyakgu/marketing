import bcrypt from 'bcryptjs';
import { getUserByUsername, createUser, hasAnyAdmin } from '@/lib/users';

export async function hashPassword(password: string): Promise<string> {
  return bcrypt.hash(password, 10);
}

export async function verifyPassword(password: string, hash: string): Promise<boolean> {
  return bcrypt.compare(password, hash);
}

/** Seeds the initial admin from ADMIN_USERNAME/ADMIN_PASSWORD env vars — never hardcoded, and a no-op once any admin exists. */
export async function ensureAdminSeeded(): Promise<void> {
  const adminUsername = process.env.ADMIN_USERNAME;
  const adminPassword = process.env.ADMIN_PASSWORD;
  if (!adminUsername || !adminPassword) return;
  if (await hasAnyAdmin()) return;

  const existing = await getUserByUsername(adminUsername);
  if (existing) return;

  const hash = await hashPassword(adminPassword);
  await createUser(adminUsername, hash, 'admin');
}
