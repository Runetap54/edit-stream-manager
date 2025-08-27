import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.56.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

const supabase = createClient(supabaseUrl, supabaseServiceKey);

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  const responseHeaders = { ...corsHeaders, "Content-Type": "application/json" };
  const url = new URL(req.url);
  const sceneId = url.pathname.split('/').pop();

  if (!sceneId) {
    return new Response(
      JSON.stringify({ 
        error: { 
          code: 'MISSING_SCENE_ID', 
          message: 'Scene ID is required' 
        },
        ok: false 
      }),
      { status: 400, headers: responseHeaders }
    );
  }

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

    // Get scene to verify ownership
    const { data: scene, error: sceneError } = await supabase
      .from('scenes')
      .select('user_id, folder')
      .eq('id', sceneId)
      .single();

    if (sceneError || !scene) {
      return new Response(
        JSON.stringify({ 
          error: { 
            code: 'SCENE_NOT_FOUND', 
            message: 'Scene not found' 
          },
          ok: false 
        }),
        { status: 404, headers: responseHeaders }
      );
    }

    if (scene.user_id !== user.id) {
      return new Response(
        JSON.stringify({ 
          error: { 
            code: 'FORBIDDEN', 
            message: 'You do not own this scene' 
          },
          ok: false 
        }),
        { status: 403, headers: responseHeaders }
      );
    }

    // Delete all objects under the scene prefix
    const scenePrefix = `users/${user.id}/Scenes/${scene.folder}/scene-${sceneId}/`;
    
    // List all objects under this prefix
    const { data: objects, error: listError } = await supabase.storage
      .from('media')
      .list(`users/${user.id}/Scenes/${scene.folder}/scene-${sceneId}`, {
        limit: 1000
      });

    if (listError) {
      console.error('Failed to list scene objects:', listError);
    } else if (objects && objects.length > 0) {
      // Delete all objects
      const objectPaths = objects.map(obj => `${scenePrefix}${obj.name}`);
      const { error: deleteError } = await supabase.storage
        .from('media')
        .remove(objectPaths);

      if (deleteError) {
        console.error('Failed to delete scene objects:', deleteError);
      }
    }

    // Delete scene_versions first (foreign key constraint)
    const { error: versionsError } = await supabase
      .from('scene_versions')
      .delete()
      .eq('scene_id', sceneId);

    if (versionsError) {
      console.error('Failed to delete scene versions:', versionsError);
    }

    // Delete scene_generations
    const { error: generationsError } = await supabase
      .from('scene_generations')
      .delete()
      .eq('scene_id', sceneId);

    if (generationsError) {
      console.error('Failed to delete scene generations:', generationsError);
    }

    // Delete the scene
    const { error: sceneDeleteError } = await supabase
      .from('scenes')
      .delete()
      .eq('id', sceneId);

    if (sceneDeleteError) {
      console.error('Failed to delete scene:', sceneDeleteError);
      return new Response(
        JSON.stringify({ 
          error: { 
            code: 'DELETE_ERROR', 
            message: 'Failed to delete scene' 
          },
          ok: false 
        }),
        { status: 500, headers: responseHeaders }
      );
    }

    return new Response(
      JSON.stringify({ 
        success: true,
        message: 'Scene deleted successfully',
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