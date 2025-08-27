import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const supabase = createClient(
  Deno.env.get('SUPABASE_URL')!,
  Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
);

// Auto-create Scenes folder when Photos project is detected
async function ensureScenesFolder(userId: string, projectName: string) {
  try {
    const scenesPath = `users/${userId}/Scenes/${projectName}`;
    
    // Check if folder exists by trying to list it
    const { data: existingFiles, error: listError } = await supabase
      .storage
      .from('media')
      .list(scenesPath, { limit: 1 });

    if (!existingFiles || existingFiles.length === 0) {
      // Create .keep file to establish the folder
      const keepContent = new Uint8Array(0); // empty file
      const { error: uploadError } = await supabase
        .storage
        .from('media')
        .upload(`${scenesPath}/.keep`, keepContent, {
          contentType: 'text/plain',
          upsert: true
        });

      if (uploadError) {
        console.error('Failed to create Scenes folder:', uploadError);
      } else {
        console.log('Created Scenes folder:', scenesPath);
      }
    }
  } catch (error) {
    console.error('Error ensuring Scenes folder:', error);
  }
}

// Get next photo number for sequential naming
async function getNextPhotoNumber(userId: string, projectName: string): Promise<number> {
  try {
    const photosPath = `users/${userId}/Photos/${projectName}`;
    
    const { data: files, error } = await supabase
      .storage
      .from('media')
      .list(photosPath, { limit: 1000 });

    if (error || !files) {
      return 1; // Start with 1 if no files found
    }

    // Extract numbers from existing photo filenames (e.g., "1.jpg", "2.png")
    const photoNumbers = files
      .map(file => {
        const match = file.name.match(/^(\d+)\./);
        return match ? parseInt(match[1], 10) : 0;
      })
      .filter(num => num > 0);

    return photoNumbers.length > 0 ? Math.max(...photoNumbers) + 1 : 1;
  } catch (error) {
    console.error('Error getting next photo number:', error);
    return 1;
  }
}

export default async function handler(req: Request) {
  // Handle CORS preflight requests
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  if (req.method !== 'POST') {
    return new Response(JSON.stringify({ error: 'Method not allowed' }), {
      status: 405,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }

  try {
    // Get user from auth
    const authHeader = req.headers.get('authorization');
    if (!authHeader) {
      return new Response(JSON.stringify({ error: 'No authorization header' }), {
        status: 401,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const { data: { user }, error: userError } = await supabase.auth.getUser(
      authHeader.replace('Bearer ', '')
    );

    if (userError || !user) {
      return new Response(JSON.stringify({ error: 'Unauthorized' }), {
        status: 401,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const { project, storage_key, original_filename } = await req.json();

    // Get file extension from original filename
    const extension = original_filename.split('.').pop() || 'jpg';
    
    // Get next photo number for sequential naming
    const nextNumber = await getNextPhotoNumber(user.id, project);
    const newFilename = `${nextNumber}.${extension}`;
    const newStorageKey = `users/${user.id}/Photos/${project}/${newFilename}`;

    // Copy/rename the file to the new sequential name
    const { error: copyError } = await supabase
      .storage
      .from('media')
      .copy(storage_key, newStorageKey);

    if (copyError) {
      console.error('Failed to rename photo:', copyError);
      return new Response(JSON.stringify({ error: 'Failed to rename photo' }), {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Delete the original file
    const { error: deleteError } = await supabase
      .storage
      .from('media')
      .remove([storage_key]);

    if (deleteError) {
      console.warn('Failed to delete original file:', deleteError);
    }

    // Ensure project exists
    const { data: existingProject, error: projectSelectError } = await supabase
      .from('projects')
      .select('id')
      .eq('name', project)
      .eq('owner_id', user.id)
      .maybeSingle();

    let projectId = existingProject?.id;

    if (!projectId) {
      const { data: newProject, error: projectError } = await supabase
        .from('projects')
        .insert({ name: project, owner_id: user.id })
        .select('id')
        .single();

      if (projectError) {
        console.error('Failed to create project:', projectError);
        return new Response(JSON.stringify({ error: 'Failed to create project' }), {
          status: 500,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }

      projectId = newProject.id;
      
      // Auto-create Scenes folder for new project
      await ensureScenesFolder(user.id, project);
    }

    // Record photo in database with new storage key
    const { data: photo, error: photoError } = await supabase
      .from('photos')
      .insert({
        storage_key: newStorageKey,
        project_id: projectId,
        owner_id: user.id,
      })
      .select()
      .single();

    if (photoError) {
      console.error('Failed to record photo:', photoError);
      return new Response(JSON.stringify({ error: 'Failed to record photo' }), {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    return new Response(JSON.stringify({ 
      success: true,
      photo: {
        ...photo,
        filename: newFilename
      }
    }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });

  } catch (error) {
    console.error('Error in photos function:', error);
    return new Response(JSON.stringify({ error: 'Internal server error' }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
}
