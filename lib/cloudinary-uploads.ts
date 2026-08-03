import { supabase } from './supabase';

export interface CloudinaryUpload {
  id: string;
  chat_id: number;
  folder: string;
  public_id: string;
  url: string;
  name: string | null;
  created_at: string;
}

// How long an unnamed upload stays eligible to have its next plain-text
// reply interpreted as its name — past this, a message is treated as an
// ordinary chat message instead, so an upload the user never got around to
// naming can't hijack an unrelated message hours later.
const PENDING_NAME_WINDOW_MS = 10 * 60 * 1000;

/** Records a freshly-uploaded image with no name yet — the webhook then asks
 * the user what to call it; the reply is picked up by getPendingUpload +
 * nameUpload below rather than going through Pepe's normal chat loop. */
export async function recordUpload(fields: {
  chatId: number;
  folder: string;
  publicId: string;
  url: string;
}): Promise<CloudinaryUpload> {
  const { data, error } = await supabase
    .from('cloudinary_uploads')
    .insert({ chat_id: fields.chatId, folder: fields.folder, public_id: fields.publicId, url: fields.url })
    .select()
    .single();
  if (error) throw new Error(error.message);
  return data;
}

/** The most recent still-unnamed upload for this chat, if any and if recent
 * enough — used to decide whether the next incoming text message is a name
 * reply rather than an ordinary chat message. */
export async function getPendingUpload(chatId: number): Promise<CloudinaryUpload | null> {
  const since = new Date(Date.now() - PENDING_NAME_WINDOW_MS).toISOString();
  const { data, error } = await supabase
    .from('cloudinary_uploads')
    .select('*')
    .eq('chat_id', chatId)
    .is('name', null)
    .gte('created_at', since)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error) throw new Error(error.message);
  return data;
}

export async function nameUpload(id: string, name: string): Promise<CloudinaryUpload> {
  const { data, error } = await supabase
    .from('cloudinary_uploads')
    .update({ name })
    .eq('id', id)
    .select()
    .single();
  if (error) throw new Error(error.message);
  return data;
}

/** Case-insensitive substring match against named uploads — how Pepe resolves
 * "the sunset image" or similar back to an actual Cloudinary URL. */
export async function findUploadsByName(name: string): Promise<CloudinaryUpload[]> {
  const { data, error } = await supabase
    .from('cloudinary_uploads')
    .select('*')
    .not('name', 'is', null)
    .ilike('name', `%${name}%`)
    .order('created_at', { ascending: false })
    .limit(10);
  if (error) throw new Error(error.message);
  return (data as CloudinaryUpload[] | null) ?? [];
}
