import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.56.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

const supabase = createClient(supabaseUrl, supabaseServiceKey);

async function deleteStoragePrefix(prefix: string): Promise<{ deletedCount: number; error?: string }> {
  try {
    const { data: objects, error: listError } = await supabase.storage
      .from('media')
      .list(prefix, {
        limit: 1000,
        recursive: true
      });

    if (listError) {
      return { deletedCount: 0, error: `Failed to list objects: ${listError.message}` };
    }

    if (!objects || objects.length === 0) {
      return { deletedCount: 0 };
    }

    // Build full paths for deletion
    const objectPaths = objects
      .filter(obj => obj.name) // Filter out null/undefined names
      .map(obj => `${prefix}${obj.name}`);

    if (objectPaths.length === 0) {
      return { deletedCount: 0 };
    }

    const { error: deleteError } = await supabase.storage
      .from('media')
      .remove(objectPaths);

    if (deleteError) {
      return { deletedCount: 0, error: `Failed to delete objects: ${deleteError.message}` };
    }

    return { deletedCount: objectPaths.length };
  } catch (error) {
    return { deletedCount: 0, error: error.message };
  }
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  const responseHeaders = { ...corsHeaders, "Content-Type": "application/json" };

  try {
    // Authenticate user
    const authHeader = req.headers.get("Authorization");
    if (!authHeader?.startsWith("Bearer ")) {
      return new Response(
        JSON.stringify({ 
          error: { 
            code: 'UNAUTHORIZED', 
            message: 'Missing or invalid authorization header' 
          },
          ok: false 
        }),
        { status: 401, headers: responseHeaders }
      );
    }

    const token = authHeader.split(" ")[1];
    const { data: { user }, error: authError } = await supabase.auth.getUser(token);
    
    if (authError || !user) {
      return new Response(
        JSON.stringify({ 
          error: { 
            code: 'AUTH_ERROR', 
            message: 'Authentication failed' 
          },
          ok: false 
        }),
        { status: 401, headers: responseHeaders }
      );
    }

    // Parse request body
    const body = await req.json();
    const { name } = body;

    if (!name) {
      return new Response(
        JSON.stringify({ 
          error: { 
            code: 'MISSING_PROJECT_NAME', 
            message: 'Project name is required' 
          },
          ok: false 
        }),
        { status: 400, headers: responseHeaders }
      );
    }

    // Verify project ownership
    const { data: project, error: projectError } = await supabase
      .from('projects')
      .select('id')
      .eq('name', name)
      .eq('owner_id', user.id)
      .single();

    if (projectError || !project) {
      return new Response(
        JSON.stringify({ 
          error: { 
            code: 'PROJECT_NOT_FOUND', 
            message: 'Project not found or not owned by user' 
          },
          ok: false 
        }),
        { status: 404, headers: responseHeaders }
      );
    }

    let deleteCounts = {
      photos: 0,
      scenes: 0,
      scene_versions: 0,
      scene_generations: 0,
      projects: 0
    };

    // Delete Photos storage
    const photosPrefix = `users/${user.id}/Photos/${name}/`;
    const photosResult = await deleteStoragePrefix(photosPrefix);
    if (photosResult.error) {
      console.error('Failed to delete photos storage:', photosResult.error);
    }

    // Delete Scenes storage
    const scenesPrefix = `users/${user.id}/Scenes/${name}/`;
    const scenesResult = await deleteStoragePrefix(scenesPrefix);
    if (scenesResult.error) {
      console.error('Failed to delete scenes storage:', scenesResult.error);
    }

    // Get all scenes for this project first
    const { data: scenes, error: scenesQueryError } = await supabase
      .from('scenes')
      .select('id')
      .eq('user_id', user.id)
      .eq('folder', name);

    if (scenesQueryError) {
      console.error('Failed to query scenes:', scenesQueryError);
    }

    const sceneIds = scenes?.map(s => s.id) || [];

    // Delete database records in correct order (due to foreign keys)
    if (sceneIds.length > 0) {
      // Delete scene_versions
      const { error: versionsError, count: versionsCount } = await supabase
        .from('scene_versions')
        .delete()
        .in('scene_id', sceneIds);

      if (versionsError) {
        console.error('Failed to delete scene versions:', versionsError);
      } else {
        deleteCounts.scene_versions = versionsCount || 0;
      }

      // Delete scene_generations
      const { error: generationsError, count: generationsCount } = await supabase
        .from('scene_generations')
        .delete()
        .in('scene_id', sceneIds);

      if (generationsError) {
        console.error('Failed to delete scene generations:', generationsError);
      } else {
        deleteCounts.scene_generations = generationsCount || 0;
      }
    }

    // Delete scenes
    const { error: scenesError, count: scenesCount } = await supabase
      .from('scenes')
      .delete()
      .eq('user_id', user.id)
      .eq('folder', name);

    if (scenesError) {
      console.error('Failed to delete scenes:', scenesError);
    } else {
      deleteCounts.scenes = scenesCount || 0;
    }

    // Delete photos
    const { error: photosError, count: photosCount } = await supabase
      .from('photos')
      .delete()
      .eq('owner_id', user.id)
      .eq('project_id', project.id);

    if (photosError) {
      console.error('Failed to delete photos:', photosError);
    } else {
      deleteCounts.photos = photosCount || 0;
    }

    // Delete project
    const { error: projectDeleteError, count: projectsCount } = await supabase
      .from('projects')
      .delete()
      .eq('id', project.id)
      .eq('owner_id', user.id);

    if (projectDeleteError) {
      console.error('Failed to delete project:', projectDeleteError);
      return new Response(
        JSON.stringify({ 
          error: { 
            code: 'DELETE_ERROR', 
            message: 'Failed to delete project' 
          },
          ok: false 
        }),
        { status: 500, headers: responseHeaders }
      );
    } else {
      deleteCounts.projects = projectsCount || 0;
    }

    return new Response(
      JSON.stringify({ 
        success: true,
        message: 'Project deleted successfully',
        data: {
          deleteCounts,
          storageDeleted: {
            photos: photosResult.deletedCount,
            scenes: scenesResult.deletedCount
          }
        },
        ok: true 
      }),
      { headers: responseHeaders }
    );

  } catch (error) {
    console.error('Unexpected error:', error);
    return new Response(
      JSON.stringify({ 
        error: { 
          code: 'INTERNAL_ERROR', 
          message: 'Internal server error' 
        },
        ok: false 
      }),
      { status: 500, headers: responseHeaders }
    );
  }
});