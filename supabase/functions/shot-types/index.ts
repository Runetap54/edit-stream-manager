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

    const method = req.method;
    const url = new URL(req.url);
    const shotTypeId = url.pathname.split('/').pop();

    switch (method) {
      case 'GET':
        // List all shot types for the user
        const { data: shotTypes, error: listError } = await supabase
          .from('shot_types')
          .select('*')
          .eq('owner_id', user.id)
          .order('sort_order', { ascending: true });

        if (listError) {
          return new Response(
            JSON.stringify({ 
              error: { 
                code: 'LIST_ERROR', 
                message: 'Failed to fetch shot types' 
              },
              ok: false 
            }),
            { status: 500, headers: responseHeaders }
          );
        }

        return new Response(
          JSON.stringify({ 
            success: true,
            data: shotTypes,
            ok: true 
          }),
          { headers: responseHeaders }
        );

      case 'POST':
        // Create new shot type
        const createBody = await req.json();
        const { name, prompt_template, hotkey, sort_order } = createBody;

        if (!name || !prompt_template || !hotkey) {
          return new Response(
            JSON.stringify({ 
              error: { 
                code: 'MISSING_FIELDS', 
                message: 'Name, prompt_template, and hotkey are required' 
              },
              ok: false 
            }),
            { status: 400, headers: responseHeaders }
          );
        }

        const { data: newShotType, error: createError } = await supabase
          .from('shot_types')
          .insert({
            owner_id: user.id,
            name,
            prompt_template,
            hotkey,
            sort_order: sort_order || 0
          })
          .select()
          .single();

        if (createError) {
          if (createError.code === '23505') { // Unique constraint violation
            return new Response(
              JSON.stringify({ 
                error: { 
                  code: 'DUPLICATE_ERROR', 
                  message: 'A shot type with this name or hotkey already exists' 
                },
                ok: false 
              }),
              { status: 409, headers: responseHeaders }
            );
          }

          return new Response(
            JSON.stringify({ 
              error: { 
                code: 'CREATE_ERROR', 
                message: 'Failed to create shot type' 
              },
              ok: false 
            }),
            { status: 500, headers: responseHeaders }
          );
        }

        return new Response(
          JSON.stringify({ 
            success: true,
            data: newShotType,
            ok: true 
          }),
          { status: 201, headers: responseHeaders }
        );

      case 'PUT':
        // Update shot type
        if (!shotTypeId || shotTypeId === 'shot-types') {
          return new Response(
            JSON.stringify({ 
              error: { 
                code: 'MISSING_ID', 
                message: 'Shot type ID is required for update' 
              },
              ok: false 
            }),
            { status: 400, headers: responseHeaders }
          );
        }

        const updateBody = await req.json();
        const { name: updateName, prompt_template: updatePrompt, hotkey: updateHotkey, sort_order: updateSort } = updateBody;

        const { data: updatedShotType, error: updateError } = await supabase
          .from('shot_types')
          .update({
            name: updateName,
            prompt_template: updatePrompt,
            hotkey: updateHotkey,
            sort_order: updateSort
          })
          .eq('id', shotTypeId)
          .eq('owner_id', user.id)
          .select()
          .single();

        if (updateError) {
          if (updateError.code === '23505') { // Unique constraint violation
            return new Response(
              JSON.stringify({ 
                error: { 
                  code: 'DUPLICATE_ERROR', 
                  message: 'A shot type with this name or hotkey already exists' 
                },
                ok: false 
              }),
              { status: 409, headers: responseHeaders }
            );
          }

          return new Response(
            JSON.stringify({ 
              error: { 
                code: 'UPDATE_ERROR', 
                message: 'Failed to update shot type' 
              },
              ok: false 
            }),
            { status: 500, headers: responseHeaders }
          );
        }

        return new Response(
          JSON.stringify({ 
            success: true,
            data: updatedShotType,
            ok: true 
          }),
          { headers: responseHeaders }
        );

      case 'DELETE':
        // Delete shot type
        if (!shotTypeId || shotTypeId === 'shot-types') {
          return new Response(
            JSON.stringify({ 
              error: { 
                code: 'MISSING_ID', 
                message: 'Shot type ID is required for deletion' 
              },
              ok: false 
            }),
            { status: 400, headers: responseHeaders }
          );
        }

        const { error: deleteError } = await supabase
          .from('shot_types')
          .delete()
          .eq('id', shotTypeId)
          .eq('owner_id', user.id);

        if (deleteError) {
          return new Response(
            JSON.stringify({ 
              error: { 
                code: 'DELETE_ERROR', 
                message: 'Failed to delete shot type' 
              },
              ok: false 
            }),
            { status: 500, headers: responseHeaders }
          );
        }

        return new Response(
          JSON.stringify({ 
            success: true,
            message: 'Shot type deleted successfully',
            ok: true 
          }),
          { headers: responseHeaders }
        );

      default:
        return new Response(
          JSON.stringify({ 
            error: { 
              code: 'METHOD_NOT_ALLOWED', 
              message: `Method ${method} not allowed` 
            },
            ok: false 
          }),
          { status: 405, headers: responseHeaders }
        );
    }

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