import { createClient } from '@supabase/supabase-js';

const supaAdmin = () =>
  createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);

export async function listFolders(prefix: string) {
  // list immediate folders under prefix
  const supa = supaAdmin();
  let page = 0, limit = 100, out: string[] = [];
  while (true) {
    const { data, error } = await supa.storage
      .from(process.env.SUPABASE_STORAGE_BUCKET!)
      .list(prefix, { limit, offset: page * limit });
    if (error) throw error;
    const folders = (data || []).filter(d => (d as any).id === null && d.name); // folders have id === null
    out.push(...folders.map(f => f.name));
    if ((data?.length || 0) < limit) break;
    page++;
  }
  return out; // array of folder names (projects)
}

export async function listPhotos(prefix: string) {
  const supa = supaAdmin();
  let page = 0, limit = 100, files: { name: string, key: string }[] = [];
  while (true) {
    const { data, error } = await supa.storage
      .from(process.env.SUPABASE_STORAGE_BUCKET!)
      .list(prefix, { limit, offset: page * limit });
    if (error) throw error;
    const imgs = (data || []).filter(f => (f as any).id !== null); // files
    files.push(...imgs.map(f => ({ name: f.name, key: `${prefix}${f.name}` })));
    if ((data?.length || 0) < limit) break;
    page++;
  }
  return files;
}

export async function signGetUrl(key: string, ttlSec = Number(process.env.SIGNED_URL_TTL_SECONDS || 600)) {
  const supa = supaAdmin();
  const { data, error } = await supa.storage
    .from(process.env.SUPABASE_STORAGE_BUCKET!)
    .createSignedUrl(key, ttlSec);
  if (error) throw error;
  return data.signedUrl;
}