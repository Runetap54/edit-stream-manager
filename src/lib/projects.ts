import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  import.meta.env.VITE_SUPABASE_URL!,
  import.meta.env.VITE_SUPABASE_ANON_KEY!
);

export async function createProject(name: string) {
  const { data: { session } } = await supabase.auth.getSession();
  if (!session?.access_token) throw new Error('Not signed in');

  const res = await fetch(
    `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/projects`,
    {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${session.access_token}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ project: name })
    }
  );
  if (!res.ok) throw new Error(`Create failed: ${res.status} ${await res.text()}`);
  return res.json();
}
