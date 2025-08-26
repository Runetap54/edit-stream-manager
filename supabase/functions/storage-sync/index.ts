import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.56.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-correlation-id",
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

function photosProjectPrefix(uid: string, project: string) {
  return `users/${uid}/${photosRoot}/${project}/`;
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

async function listPhotos(prefix: string) {
  let page = 0, limit = 100, files: { name: string, key: string }[] = [];
  while (true) {
    const { data, error } = await supabase.storage
      .from(storageBucket)
      .list(prefix, { limit, offset: page * limit });
    if (error) throw error;
    const imgs = (data || []).filter(f => (f as any).id !== null);
    files.push(...imgs.map(f => ({ name: f.name, key: `${prefix}${f.name}` })));
    if ((data?.length || 0) < limit) break;
    page++;
  }
  return files;
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
        route: '/storage-sync',
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
        route: '/storage-sync',
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

    if (req.method === "POST") {
      // On-demand backfill
      try {
        const userPhotosRoot = photosRootForUser(user.id);
        const projectFolders = await listFolders(userPhotosRoot);
        
        let projectsUpserted = 0;
        let photosInserted = 0;

        // Sync projects
        if (projectFolders.length > 0) {
          const projectsToUpsert = projectFolders.map(name => ({
            owner_id: user.id,
            name,
            updated_at: new Date().toISOString()
          }));

          const { error: projectUpsertError } = await supabase
            .from("projects")
            .upsert(projectsToUpsert, { 
              onConflict: 'owner_id,name',
              ignoreDuplicates: false
            });

          if (projectUpsertError) {
            throw new Error(`Failed to sync projects: ${projectUpsertError.message}`);
          }

          projectsUpserted = projectsToUpsert.length;
        }

        // Get all projects from DB to get their IDs
        const { data: dbProjects, error: projectsError } = await supabase
          .from("projects")
          .select("id, name")
          .eq("owner_id", user.id);

        if (projectsError) {
          throw new Error(`Failed to fetch projects: ${projectsError.message}`);
        }

        const projectIdMap = new Map(dbProjects!.map(p => [p.name, p.id]));

        // Sync photos for each project
        for (const projectName of projectFolders) {
          const projectId = projectIdMap.get(projectName);
          if (!projectId) continue;

          const projectPrefix = photosProjectPrefix(user.id, projectName);
          const files = await listPhotos(projectPrefix);

          if (files.length === 0) continue;

          // Get existing photos from DB
          const { data: existingPhotos } = await supabase
            .from("photos")
            .select("storage_key")
            .eq("project_id", projectId)
            .eq("owner_id", user.id);

          const existingKeys = new Set((existingPhotos || []).map(p => p.storage_key));
          
          // Insert new photos
          const newPhotos = files
            .filter(file => !existingKeys.has(file.key))
            .map(file => ({
              owner_id: user.id,
              project_id: projectId,
              storage_key: file.key
            }));

          if (newPhotos.length > 0) {
            const { error: photosInsertError } = await supabase
              .from("photos")
              .insert(newPhotos);

            if (photosInsertError) {
              console.warn(`Failed to insert photos for project ${projectName}: ${photosInsertError.message}`);
            } else {
              photosInserted += newPhotos.length;
            }
          }
        }

        return new Response(
          JSON.stringify({ 
            data: { 
              projectsUpserted, 
              photosInserted 
            }, 
            ok: true 
          }),
          { headers: responseHeaders }
        );

      } catch (syncError: any) {
        await logError({
          route: '/storage-sync',
          method: 'POST',
          status: 500,
          code: 'SYNC_ERROR',
          message: 'Failed to sync storage with database',
          correlationId,
          userId: user.id,
          safeContext: { 
            syncError: syncError.message 
          }
        });
        
        return new Response(
          JSON.stringify({ 
            error: { 
              code: 'SYNC_ERROR', 
              message: 'Failed to sync storage with database',
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
      route: '/storage-sync',
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
      route: '/storage-sync',
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