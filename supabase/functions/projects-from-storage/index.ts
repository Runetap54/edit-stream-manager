import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.56.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-correlation-id",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
};

const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const storageBucket = Deno.env.get("SUPABASE_STORAGE_BUCKET") || "media";
const photosRoot = Deno.env.get("STORAGE_PHOTOS_ROOT") || "Photos";

const supabase = createClient(supabaseUrl, supabaseServiceKey);

function generateCorrelationId(): string {
  return crypto.randomUUID();
}

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

function photosRootForUser(uid: string) {
  return `users/${uid}/${photosRoot}/`;
}

async function listFolders(prefix: string) {
  let page = 0, limit = 100, out: string[] = [];
  while (true) {
    const { data, error } = await supabase.storage
      .from(storageBucket)
      .list(prefix, { limit, offset: page * limit });
    if (error) throw error;
    const folders = (data || []).filter(d => (d as any).id === null && d.name);
    out.push(...folders.map(f => f.name));
    if ((data?.length || 0) < limit) break;
    page++;
  }
  return out;
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
        route: '/projects-from-storage',
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
        route: '/projects-from-storage',
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
      // List projects from storage and sync to DB
      const userPhotosRoot = photosRootForUser(user.id);
      console.log(`Looking for project folders with prefix: ${userPhotosRoot}`);
      console.log(`User ID: ${user.id}`);
      
      try {
        const projectFolders = await listFolders(userPhotosRoot);
        console.log(`Found ${projectFolders.length} project folders for user ${user.id}:`, projectFolders);
        
        // Sync projects to database
        const projectsToUpsert = projectFolders.map(name => ({
          owner_id: user.id,
          name,
          updated_at: new Date().toISOString()
        }));

        if (projectsToUpsert.length > 0) {
          const { error: upsertError } = await supabase
            .from("projects")
            .upsert(projectsToUpsert, { 
              onConflict: 'owner_id,name',
              ignoreDuplicates: false
            });

          if (upsertError) {
            console.warn(`Failed to sync projects to DB: ${upsertError.message}`);
          }
        }

        return new Response(
          JSON.stringify({ 
            data: { projects: projectFolders }, 
            ok: true 
          }),
          { headers: responseHeaders }
        );

      } catch (storageError: any) {
        await logError({
          route: '/projects-from-storage',
          method: 'GET',
          status: 500,
          code: 'STORAGE_ERROR',
          message: 'Failed to list projects from storage',
          correlationId,
          userId: user.id,
          safeContext: { 
            userPhotosRoot,
            storageError: storageError.message 
          }
        });
        
        return new Response(
          JSON.stringify({ 
            error: { 
              code: 'STORAGE_ERROR', 
              message: 'Failed to list projects from storage',
              correlationId 
            },
            ok: false 
          }),
          { status: 500, headers: responseHeaders }
        );
      }
    }

    // Method not allowed
    await logError({
      route: '/projects-from-storage',
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
      route: '/projects-from-storage',
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