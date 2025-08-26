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
        route: '/projects',
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
        route: '/projects',
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
      // Get user's projects with pagination
      const url = new URL(req.url);
      const limit = Math.min(parseInt(url.searchParams.get("limit") || "50"), 100);
      
      const { data: projects, error: projectsError } = await supabase
        .from("projects")
        .select("id, name, created_at, updated_at")
        .eq("owner_id", user.id)
        .order("updated_at", { ascending: false })
        .limit(limit);

      if (projectsError) {
        await logError({
          route: '/projects',
          method: 'GET',
          status: 500,
          code: 'SERVER_ERROR',
          message: 'Failed to fetch projects',
          correlationId,
          userId: user.id,
          safeContext: { dbError: projectsError.message }
        });
        
        return new Response(
          JSON.stringify({ 
            error: { 
              code: 'SERVER_ERROR', 
              message: 'Failed to fetch projects',
              correlationId 
            },
            ok: false 
          }),
          { status: 500, headers: responseHeaders }
        );
      }

      return new Response(
        JSON.stringify({ data: projects, ok: true }),
        { headers: responseHeaders }
      );
    }

    if (req.method === "POST") {
      // Create or update project
      let body;
      try {
        body = await req.json();
      } catch (parseError) {
        await logError({
          route: '/projects',
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

      const { name } = body;
      
      if (!name || typeof name !== 'string' || name.trim().length === 0) {
        await logError({
          route: '/projects',
          method: 'POST',
          status: 400,
          code: 'VALIDATION_ERROR',
          message: 'Project name is required',
          correlationId,
          userId: user.id,
        });
        
        return new Response(
          JSON.stringify({ 
            error: { 
              code: 'VALIDATION_ERROR', 
              message: 'Project name is required',
              correlationId 
            },
            ok: false 
          }),
          { status: 400, headers: responseHeaders }
        );
      }

      // Upsert project (create or update updated_at)
      const { data: project, error: projectError } = await supabase
        .from("projects")
        .upsert(
          { 
            owner_id: user.id, 
            name: name.trim(),
            updated_at: new Date().toISOString()
          },
          { 
            onConflict: 'owner_id,name',
            ignoreDuplicates: false 
          }
        )
        .select()
        .single();

      if (projectError) {
        const isConflict = projectError.code === '23505';
        const statusCode = isConflict ? 409 : 500;
        const errorCode = isConflict ? 'CONFLICT_ERROR' : 'SERVER_ERROR';
        const message = isConflict ? 'Project name already exists' : 'Failed to create project';
        
        await logError({
          route: '/projects',
          method: 'POST',
          status: statusCode,
          code: errorCode,
          message,
          correlationId,
          userId: user.id,
          safeContext: { 
            projectName: name,
            dbError: projectError.message,
            dbCode: projectError.code
          }
        });
        
        return new Response(
          JSON.stringify({ 
            error: { 
              code: errorCode, 
              message,
              correlationId 
            },
            ok: false 
          }),
          { status: statusCode, headers: responseHeaders }
        );
      }

      return new Response(
        JSON.stringify({ data: project, ok: true }),
        { headers: responseHeaders }
      );
    }

    // Method not allowed
    await logError({
      route: '/projects',
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
      route: '/projects',
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