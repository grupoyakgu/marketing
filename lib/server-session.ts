import { cookies } from 'next/headers';
import { verifySessionToken, SESSION_COOKIE_NAME, type SessionPayload } from '@/lib/session';

export async function getServerSession(): Promise<SessionPayload | null> {
  const token = cookies().get(SESSION_COOKIE_NAME)?.value;
  return token ? verifySessionToken(token) : null;
}
