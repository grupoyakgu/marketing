import crypto from 'crypto';
import { supabase } from '@/lib/supabase';

const TOKEN_TTL_MS = 60 * 60 * 1000; // 1 hour

function hashToken(token: string): string {
  return crypto.createHash('sha256').update(token).digest('hex');
}

/** Returns the raw token (only ever held in memory / the emailed link -- the
 * DB stores just its sha256 hash, same idea as a password hash). */
export async function createPasswordResetToken(userId: string): Promise<string> {
  const token = crypto.randomBytes(32).toString('hex');
  const { error } = await supabase.from('password_reset_tokens').insert({
    user_id: userId,
    token_hash: hashToken(token),
    expires_at: new Date(Date.now() + TOKEN_TTL_MS).toISOString(),
  });
  if (error) throw new Error(error.message);
  return token;
}

export async function consumePasswordResetToken(token: string): Promise<{ userId: string } | null> {
  const tokenHash = hashToken(token);
  const { data } = await supabase
    .from('password_reset_tokens')
    .select('id, user_id, expires_at, used_at')
    .eq('token_hash', tokenHash)
    .maybeSingle();

  if (!data || data.used_at || new Date(data.expires_at).getTime() < Date.now()) return null;

  const { error } = await supabase
    .from('password_reset_tokens')
    .update({ used_at: new Date().toISOString() })
    .eq('id', data.id);
  if (error) throw new Error(error.message);

  return { userId: data.user_id };
}
