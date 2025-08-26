import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.56.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-correlation-id",
};

const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const supabase = createClient(supabaseUrl, supabaseServiceKey);

// Generate correlation ID
function generateCorrelationId(): string {
  return crypto.randomUUID();
}

// Log error to database
async function logError(params: {
  route: string;
  method: string;
  status: number;
  code: string;
  message: string;
  correlationId: string;
  userId?: string;
  safeContext?: Record<string, any>;
}): Promise<void> {
  try {
    await supabase
      .from('error_events')
      .insert({
        route: params.route,
        method: params.method,
        status: params.status,
        code: params.code,
        message: params.message,
        correlation_id: params.correlationId,
        user_id: params.userId,
        safe_context: params.safeContext || {}
      });
    
    console.error(`[${params.correlationId}] ${params.method} ${params.route} - ${params.status} ${params.code}: ${params.message}`);
  } catch (error) {
    console.error('Failed to log error:', error);
  }
}

serve(async (req) => {
  const correlationId = generateCorrelationId();
  const responseHeaders = { 
    ...corsHeaders, 
    "Content-Type": "application/json",
    "x-correlation-id": correlationId
  };

  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    // Get user from auth
    const authHeader = req.headers.get("authorization");
    if (!authHeader) {
      await logError({
        route: '/photos',
        method: req.method,
        status: 401,
        code: 'AUTH_ERROR',
        message: 'Missing authorization header',
        correlationId,
      });
      
      return new Response(
        JSON.stringify({ 
          error: { 
            code: 'AUTH_ERROR', 
            message: 'Authentication required',
            correlationId 
          },
          ok: false 
        }),
        { status: 401, headers: responseHeaders }
      );
    }

    const token = authHeader.replace("Bearer ", "");
    const { data: { user }, error: authError } = await supabase.auth.getUser(token);

    if (authError || !user) {
      await logError({
        route: '/photos',
        method: req.method,
        status: 401,
        code: 'AUTH_ERROR',
        message: 'Invalid authorization token',
        correlationId,
        safeContext: { authError: authError?.message }
      });
      
      return new Response(
        JSON.stringify({ 
          error: { 
            code: 'AUTH_ERROR', 
            message: 'Invalid authorization',
            correlationId 
          },
          ok: false 
        }),
        { status: 401, headers: responseHeaders }
      );
    }

    if (req.method === "GET") {
      // Get photos for a specific project
      const url = new URL(req.url);
      const projectId = url.searchParams.get("projectId");
      
      if (!projectId) {
        await logError({
          route: '/photos',
          method: 'GET',
          status: 400,
          code: 'VALIDATION_ERROR',
          message: 'Project ID is required',
          correlationId,
          userId: user.id,
        });
        
        return new Response(
          JSON.stringify({ 
            error: { 
              code: 'VALIDATION_ERROR', 
              message: 'Project ID is required',
              correlationId 
            },
            ok: false 
          }),
          { status: 400, headers: responseHeaders }
        );
      }

      // First verify the user owns this project
      const { data: project, error: projectError } = await supabase
        .from("projects")
        .select("id")
        .eq("id", projectId)
        .eq("owner_id", user.id)
        .single();

      if (projectError || !project) {
        await logError({
          route: '/photos',
          method: 'GET',
          status: 404,
          code: 'NOT_FOUND',
          message: 'Project not found or access denied',
          correlationId,
          userId: user.id,
          safeContext: { projectId, dbError: projectError?.message }
        });
        
        return new Response(
          JSON.stringify({ 
            error: { 
              code: 'NOT_FOUND', 
              message: 'Project not found or access denied',
              correlationId 
            },
            ok: false 
          }),
          { status: 404, headers: responseHeaders }
        );
      }

      // Get photos for the project
      const { data: photos, error: photosError } = await supabase
        .from("photos")
        .select("id, storage_key, created_at")
        .eq("project_id", projectId)
        .eq("owner_id", user.id)
        .order("created_at", { ascending: false });

      if (photosError) {
        await logError({
          route: '/photos',
          method: 'GET',
          status: 500,
          code: 'SERVER_ERROR',
          message: 'Failed to fetch photos',
          correlationId,
          userId: user.id,
          safeContext: { projectId, dbError: photosError.message }
        });
        
        return new Response(
          JSON.stringify({ 
            error: { 
              code: 'SERVER_ERROR', 
              message: 'Failed to fetch photos',
              correlationId 
            },
            ok: false 
          }),
          { status: 500, headers: responseHeaders }
        );
      }

      return new Response(
        JSON.stringify({ data: photos, ok: true }),
        { headers: responseHeaders }
      );
    }

    if (req.method === "POST") {
      // Record a new photo
      let body;
      try {
        body = await req.json();
      } catch (parseError) {
        await logError({
          route: '/photos',
          method: 'POST',
          status: 400,
          code: 'VALIDATION_ERROR',
          message: 'Invalid JSON in request body',
          correlationId,
          userId: user.id,
        });
        
        return new Response(
          JSON.stringify({ 
            error: { 
              code: 'VALIDATION_ERROR', 
              message: 'Invalid JSON in request body',
              correlationId 
            },
            ok: false 
          }),
          { status: 400, headers: responseHeaders }
        );
      }

      const { projectId, storageKey } = body;
      
      if (!projectId || !storageKey) {
        await logError({
          route: '/photos',
          method: 'POST',
          status: 400,
          code: 'VALIDATION_ERROR',
          message: 'Project ID and storage key are required',
          correlationId,
          userId: user.id,
        });
        
        return new Response(
          JSON.stringify({ 
            error: { 
              code: 'VALIDATION_ERROR', 
              message: 'Project ID and storage key are required',
              correlationId 
            },
            ok: false 
          }),
          { status: 400, headers: responseHeaders }
        );
      }

      // Verify project ownership
      const { data: project, error: projectError } = await supabase
        .from("projects")
        .select("id")
        .eq("id", projectId)
        .eq("owner_id", user.id)
        .single();

      if (projectError || !project) {
        await logError({
          route: '/photos',
          method: 'POST',
          status: 404,
          code: 'NOT_FOUND',
          message: 'Project not found or access denied',
          correlationId,
          userId: user.id,
          safeContext: { projectId, dbError: projectError?.message }
        });
        
        return new Response(
          JSON.stringify({ 
            error: { 
              code: 'NOT_FOUND', 
              message: 'Project not found or access denied',
              correlationId 
            },
            ok: false 
          }),
          { status: 404, headers: responseHeaders }
        );
      }

      // Insert photo record
      const { data: photo, error: photoError } = await supabase
        .from("photos")
        .insert({
          owner_id: user.id,
          project_id: projectId,
          storage_key: storageKey
        })
        .select()
        .single();

      if (photoError) {
        await logError({
          route: '/photos',
          method: 'POST',
          status: 500,
          code: 'SERVER_ERROR',
          message: 'Failed to create photo record',
          correlationId,
          userId: user.id,
          safeContext: { 
            projectId,
            storageKey,
            dbError: photoError.message,
            dbCode: photoError.code
          }
        });
        
        return new Response(
          JSON.stringify({ 
            error: { 
              code: 'SERVER_ERROR', 
              message: 'Failed to create photo record',
              correlationId 
            },
            ok: false 
          }),
          { status: 500, headers: responseHeaders }
        );
      }

      return new Response(
        JSON.stringify({ data: photo, ok: true }),
        { headers: responseHeaders }
      );
    }

    // Method not allowed
    await logError({
      route: '/photos',
      method: req.method,
      status: 405,
      code: 'METHOD_NOT_ALLOWED',
      message: `Method ${req.method} not allowed`,
      correlationId,
      userId: user.id,
    });
    
    return new Response(
      JSON.stringify({ 
        error: { 
          code: 'METHOD_NOT_ALLOWED', 
          message: `Method ${req.method} not allowed`,
          correlationId 
        },
        ok: false 
      }),
      { status: 405, headers: responseHeaders }
    );

  } catch (error: any) {
    await logError({
      route: '/photos',
      method: req.method,
      status: 500,
      code: 'SERVER_ERROR',
      message: `Unexpected error: ${error.message}`,
      correlationId,
      safeContext: { errorType: error.name }
    });
    
    return new Response(
      JSON.stringify({ 
        error: { 
          code: 'SERVER_ERROR', 
          message: 'Internal server error',
          correlationId 
        },
        ok: false 
      }),
      { status: 500, headers: responseHeaders }
    );
  }
});