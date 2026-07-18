import { SignJWT } from 'jose/jwt/sign';
import { jwtVerify } from 'jose/jwt/verify';
import type { UserRole } from '@/lib/users';

// Kept dependency-free (only `jose`) so it can be imported from middleware.ts,
// which runs on the Edge runtime and can't bundle bcryptjs or the Supabase client.

export const SESSION_COOKIE_NAME = 'session';
export const SESSION_MAX_AGE = 60 * 60 * 24 * 7; // 7 days, in seconds

export interface SessionPayload {
  sub: string;
  username: string;
  role: UserRole;
}

function getSecretKey(): Uint8Array {
  const secret = process.env.SESSION_SECRET;
  if (!secret) throw new Error('SESSION_SECRET not configured');
  return new TextEncoder().encode(secret);
}

export async function createSessionToken(payload: SessionPayload): Promise<string> {
  return new SignJWT({ ...payload })
    .setProtectedHeader({ alg: 'HS256' })
    .setIssuedAt()
    .setExpirationTime(`${SESSION_MAX_AGE}s`)
    .sign(getSecretKey());
}

export async function verifySessionToken(token: string): Promise<SessionPayload | null> {
  try {
    const { payload } = await jwtVerify(token, getSecretKey());
    if (
      typeof payload.sub !== 'string' ||
      typeof payload.username !== 'string' ||
      (payload.role !== 'admin' && payload.role !== 'user')
    ) {
      return null;
    }
    return { sub: payload.sub, username: payload.username, role: payload.role };
  } catch {
    return null;
  }
}
