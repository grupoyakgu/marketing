import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

export type UserRole = 'admin' | 'user';

export interface User {
  id: string;
  username: string;
  password_hash: string;
  role: UserRole;
  disabled: boolean;
  created_at: string;
}

export type PublicUser = Omit<User, 'password_hash'>;

function toPublicUser(u: User): PublicUser {
  const { password_hash: _password_hash, ...rest } = u;
  return rest;
}

export async function getUserByUsername(username: string): Promise<User | null> {
  const { data } = await supabase.from('users').select('*').eq('username', username).maybeSingle();
  return data;
}

export async function getUserById(id: string): Promise<User | null> {
  const { data } = await supabase.from('users').select('*').eq('id', id).maybeSingle();
  return data;
}

export async function hasAnyAdmin(): Promise<boolean> {
  const { data } = await supabase.from('users').select('id').eq('role', 'admin').limit(1);
  return !!data && data.length > 0;
}

export async function createUser(
  username: string,
  passwordHash: string,
  role: UserRole
): Promise<PublicUser> {
  const { data, error } = await supabase
    .from('users')
    .insert({ username, password_hash: passwordHash, role })
    .select()
    .single();
  if (error) throw new Error(error.message);
  return toPublicUser(data);
}

export async function listUsers(): Promise<PublicUser[]> {
  const { data, error } = await supabase.from('users').select('*').order('created_at', { ascending: true });
  if (error) throw new Error(error.message);
  return (data ?? []).map(toPublicUser);
}

export async function setUserDisabled(id: string, disabled: boolean): Promise<void> {
  const { error } = await supabase.from('users').update({ disabled }).eq('id', id);
  if (error) throw new Error(error.message);
}

export async function setUserRole(id: string, role: UserRole): Promise<void> {
  const { error } = await supabase.from('users').update({ role }).eq('id', id);
  if (error) throw new Error(error.message);
}

export async function setUserPassword(id: string, passwordHash: string): Promise<void> {
  const { error } = await supabase.from('users').update({ password_hash: passwordHash }).eq('id', id);
  if (error) throw new Error(error.message);
}

export async function deleteUser(id: string): Promise<void> {
  const { error } = await supabase.from('users').delete().eq('id', id);
  if (error) throw new Error(error.message);
}
