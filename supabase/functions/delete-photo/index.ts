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
    const { project, key } = body;

    if (!project || !key) {
      return new Response(
        JSON.stringify({ 
          error: { 
            code: 'MISSING_PARAMS', 
            message: 'Both project and key are required' 
          },
          ok: false 
        }),
        { status: 400, headers: responseHeaders }
      );
    }

    // Verify key belongs to user's project
    const expectedPrefix = `users/${user.id}/Photos/${project}/`;
    if (!key.startsWith(expectedPrefix)) {
      return new Response(
        JSON.stringify({ 
          error: { 
            code: 'INVALID_KEY', 
            message: 'Photo key does not belong to your project' 
          },
          ok: false 
        }),
        { status: 403, headers: responseHeaders }
      );
    }

    // Delete from storage
    const { error: storageError } = await supabase.storage
      .from('media')
      .remove([key]);

    if (storageError) {
      console.error('Failed to delete from storage:', storageError);
      return new Response(
        JSON.stringify({ 
          error: { 
            code: 'STORAGE_DELETE_ERROR', 
            message: 'Failed to delete photo from storage' 
          },
          ok: false 
        }),
        { status: 500, headers: responseHeaders }
      );
    }

    // Delete from database (photos table)
    const { error: dbError } = await supabase
      .from('photos')
      .delete()
      .eq('storage_key', key)
      .eq('owner_id', user.id);

    if (dbError) {
      console.error('Failed to delete from database:', dbError);
      // Don't return error here - storage deletion succeeded
    }

    return new Response(
      JSON.stringify({ 
        success: true,
        message: 'Photo deleted successfully',
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