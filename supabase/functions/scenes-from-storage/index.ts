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
const scenesRoot = Deno.env.get("STORAGE_SCENES_ROOT") || "Scenes";
const signedUrlTtl = Number(Deno.env.get("SIGNED_URL_TTL_SECONDS") || 600);

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

function scenesProjectPrefix(uid: string, project: string) {
  // Updated to match user's manual reorganization - Scenes at root level
  return `${scenesRoot}/${project}/`;
}

async function listScenes(prefix: string) {
  let page = 0, limit = 100, files: { name: string, key: string }[] = [];
  while (true) {
    const { data, error } = await supabase.storage
      .from(storageBucket)
      .list(prefix, { limit, offset: page * limit });
    if (error) throw error;
    const videos = (data || []).filter(f => 
      (f as any).id !== null && 
      (f.name.toLowerCase().endsWith('.mp4') || f.name.toLowerCase().endsWith('.mov') || f.name.toLowerCase().endsWith('.avi'))
    );
    files.push(...videos.map(f => ({ name: f.name, key: `${prefix}${f.name}` })));
    if ((data?.length || 0) < limit) break;
    page++;
  }
  return files;
}

async function signGetUrl(key: string, ttlSec = signedUrlTtl) {
  const { data, error } = await supabase.storage
    .from(storageBucket)
    .createSignedUrl(key, ttlSec);
  if (error) throw error;
  return data.signedUrl;
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
        route: '/scenes-from-storage',
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
        route: '/scenes-from-storage',
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
      // Get video scenes for a specific project from storage
      const url = new URL(req.url);
      const projectName = url.searchParams.get("project");
      
      if (!projectName) {
        await logError({
          route: '/scenes-from-storage',
          method: 'GET',
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

      try {
        const projectPrefix = scenesProjectPrefix(user.id, projectName);
        console.log(`Looking for scenes with prefix: ${projectPrefix}`);
        console.log(`User ID: ${user.id}, Project: ${projectName}`);
        
        const files = await listScenes(projectPrefix);
        console.log(`Found ${files.length} scene files with prefix: ${projectPrefix}`);
        
        // Generate signed URLs for all scenes
        const scenesWithUrls = await Promise.all(
          files.map(async (file) => {
            try {
              const signedUrl = await signGetUrl(file.key);
              return {
                key: file.key,
                url: signedUrl,
                name: file.name
              };
            } catch (urlError) {
              console.error(`Failed to generate signed URL for ${file.key}:`, urlError);
              return {
                key: file.key,
                url: null,
                name: file.name
              };
            }
          })
        );

        return new Response(
          JSON.stringify({ 
            data: { scenes: scenesWithUrls }, 
            ok: true 
          }),
          { headers: responseHeaders }
        );

      } catch (storageError: any) {
        await logError({
          route: '/scenes-from-storage',
          method: 'GET',
          status: 500,
          code: 'STORAGE_ERROR',
          message: 'Failed to list scenes from storage',
          correlationId,
          userId: user.id,
          safeContext: { 
            projectName,
            storageError: storageError.message 
          }
        });
        
        return new Response(
          JSON.stringify({ 
            error: { 
              code: 'STORAGE_ERROR', 
              message: 'Failed to list scenes from storage',
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
      route: '/scenes-from-storage',
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
      route: '/scenes-from-storage',
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