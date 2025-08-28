import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.56.0";
import { v4 as uuidv4 } from "https://esm.sh/uuid@9.0.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const lumaApiKey = Deno.env.get("LUMA_API_KEY")!;
const lumaApiBase = Deno.env.get("LUMA_API_BASE") || "https://api.lumalabs.ai/dream-machine/v1";
const signedUrlTtl = parseInt(Deno.env.get("SIGNED_URL_TTL_SECONDS") || "3600");

const supabase = createClient(supabaseUrl, supabaseServiceKey);

function generateCorrelationId(): string {
  return uuidv4();
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
}) {
  try {
    await supabase.from("error_events").insert({
      route: params.route,
      method: params.method,
      status: params.status,
      code: params.code,
      message: params.message,
      correlation_id: params.correlationId,
      user_id: params.userId,
      safe_context: params.safeContext,
    });
  } catch (logErr) {
    console.error("Failed to log error:", logErr);
  }
  console.error(`[${params.correlationId}] ${params.method} ${params.route} - ${params.status} ${params.code}: ${params.message}`, params.safeContext);
}

function validateSceneRequest(body: any) {
  const errors: string[] = [];
  
  if (!body.folder || typeof body.folder !== 'string') {
    errors.push('folder is required and must be a string');
  }
  
  if (!body.start_key || typeof body.start_key !== 'string') {
    errors.push('start_key is required and must be a string');
  }
  
  if (body.end_key && typeof body.end_key !== 'string') {
    errors.push('end_key must be a string if provided');
  }
  
  if (!body.shot_type_id || typeof body.shot_type_id !== 'string') {
    errors.push('shot_type_id is required and must be a string');
  }
  
  return errors;
}

async function generateSignedUrl(storagePath: string): Promise<string | null> {
  try {
    const { data, error } = await supabase.storage
      .from('media')
      .createSignedUrl(storagePath, signedUrlTtl);
      
    if (error) throw error;
    return data.signedUrl;
  } catch (error) {
    console.error('Failed to generate signed URL:', error);
    return null;
  }
}

function extractStoragePath(cdnUrl: string): string {
  const match = cdnUrl.match(/\/storage\/v1\/object\/(?:sign|public)\/media\/(.+?)(?:\?|$)/);
  return match ? match[1] : cdnUrl;
}

async function callLumaAPI(payload: any, correlationId: string): Promise<{ 
  success: boolean; 
  data?: any; 
  error?: string;
  lumaError?: {
    status: number;
    body: string;
    parsed?: any;
  }
}> {
  try {
    console.log(`[${correlationId}] Calling Luma Dream Machine v1 API with payload:`, JSON.stringify(payload, null, 2));
    
    const response = await fetch(lumaApiBase, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${lumaApiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(payload)
    });
    
    const responseText = await response.text();
    console.log(`[${correlationId}] Luma API response status: ${response.status}`);
    console.log(`[${correlationId}] Luma API response body: ${responseText}`);
    
    if (!response.ok) {
      let parsedError;
      try {
        parsedError = JSON.parse(responseText);
      } catch {
        // Keep as string if not valid JSON
      }
      
      return {
        success: false,
        error: `Luma API returned ${response.status}: ${responseText}`,
        lumaError: {
          status: response.status,
          body: responseText,
          parsed: parsedError
        }
      };
    }
    
    const data = JSON.parse(responseText);
    return { success: true, data };
    
  } catch (error) {
    console.error(`[${correlationId}] Luma API call failed:`, error);
    return {
      success: false,
      error: `Luma API call failed: ${error.message}`
    };
  }
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  const correlationId = generateCorrelationId();
  const responseHeaders = { ...corsHeaders, "Content-Type": "application/json" };

  try {
    // Parse and validate request
    let body;
    try {
      body = await req.json();
    } catch (parseError) {
      await logError({
        route: '/luma-create-scene',
        method: 'POST',
        status: 400,
        code: 'INVALID_JSON',
        message: 'Invalid JSON in request body',
        correlationId,
      });
      
      return new Response(
        JSON.stringify({ 
          error: { 
            code: 'INVALID_JSON', 
            message: 'Invalid JSON in request body',
            correlationId 
          },
          ok: false 
        }),
        { status: 400, headers: responseHeaders }
      );
    }

    const validationErrors = validateSceneRequest(body);
    if (validationErrors.length > 0) {
      await logError({
        route: '/luma-create-scene',
        method: 'POST',
        status: 400,
        code: 'VALIDATION_ERROR',
        message: validationErrors.join(', '),
        correlationId,
        safeContext: { validationErrors }
      });
      
      return new Response(
        JSON.stringify({ 
          error: { 
            code: 'VALIDATION_ERROR', 
            message: 'Request validation failed',
            detail: validationErrors,
            correlationId 
          },
          ok: false 
        }),
        { status: 400, headers: responseHeaders }
      );
    }

    // Authenticate user
    const authHeader = req.headers.get("Authorization");
    if (!authHeader?.startsWith("Bearer ")) {
      return new Response(
        JSON.stringify({ 
          error: { 
            code: 'UNAUTHORIZED', 
            message: 'Missing or invalid authorization header',
            correlationId 
          },
          ok: false 
        }),
        { status: 401, headers: responseHeaders }
      );
    }

    const token = authHeader.split(" ")[1];
    const { data: { user }, error: authError } = await supabase.auth.getUser(token);
    
    if (authError || !user) {
      await logError({
        route: '/luma-create-scene',
        method: 'POST',
        status: 401,
        code: 'AUTH_ERROR',
        message: authError?.message || 'User not found',
        correlationId,
      });
      
      return new Response(
        JSON.stringify({ 
          error: { 
            code: 'AUTH_ERROR', 
            message: 'Authentication failed',
            correlationId 
          },
          ok: false 
        }),
        { status: 401, headers: responseHeaders }
      );
    }

    // Check user profile status
    const { data: profile, error: profileError } = await supabase
      .from('profiles')
      .select('status')
      .eq('id', user.id)
      .single();

    if (profileError || profile?.status !== 'approved') {
      await logError({
        route: '/luma-create-scene',
        method: 'POST',
        status: 403,
        code: 'PROFILE_NOT_APPROVED',
        message: 'User profile not approved',
        correlationId,
        userId: user.id,
      });
      
      return new Response(
        JSON.stringify({ 
          error: { 
            code: 'PROFILE_NOT_APPROVED', 
            message: 'Your profile must be approved to generate scenes',
            correlationId 
          },
          ok: false 
        }),
        { status: 403, headers: responseHeaders }
      );
    }

    // Get shot type details
    const { data: shotType, error: shotTypeError } = await supabase
      .from('shot_types')
      .select('name, prompt_template')
      .eq('id', body.shot_type_id)
      .eq('owner_id', user.id)
      .single();

    if (shotTypeError || !shotType) {
      await logError({
        route: '/luma-create-scene',
        method: 'POST',
        status: 400,
        code: 'SHOT_TYPE_NOT_FOUND',
        message: 'Shot type not found or not owned by user',
        correlationId,
        userId: user.id,
      });
      
      return new Response(
        JSON.stringify({ 
          error: { 
            code: 'SHOT_TYPE_NOT_FOUND', 
            message: 'Shot type not found',
            correlationId 
          },
          ok: false 
        }),
        { status: 400, headers: responseHeaders }
      );
    }

    // Get project info for ordinal calculation
    const { data: project, error: projectError } = await supabase
      .from('projects')
      .select('id')
      .eq('name', body.folder)
      .eq('owner_id', user.id)
      .single();

    if (projectError || !project) {
      await logError({
        route: '/luma-create-scene',
        method: 'POST',
        status: 404,
        code: 'PROJECT_NOT_FOUND',
        message: 'Project not found',
        correlationId,
        userId: user.id,
      });
      
      return new Response(
        JSON.stringify({ 
          error: { 
            code: 'PROJECT_NOT_FOUND', 
            message: 'Project not found',
            correlationId 
          },
          ok: false 
        }),
        { status: 404, headers: responseHeaders }
      );
    }

    // Get next ordinal for this project
    const { data: ordinalResult, error: ordinalError } = await supabase
      .rpc('next_scene_ordinal', { p_project_id: project.id });

    if (ordinalError) {
      console.error('Failed to get next ordinal:', ordinalError);
      return new Response(
        JSON.stringify({ 
          error: { 
            code: 'DB_ERROR', 
            message: 'Failed to get next ordinal',
            correlationId 
          },
          ok: false 
        }),
        { status: 500, headers: responseHeaders }
      );
    }

    const nextOrdinal = ordinalResult;

    // Generate signed URLs for the images
    const startFrameStoragePath = extractStoragePath(body.start_key);
    const endFrameStoragePath = body.end_key ? extractStoragePath(body.end_key) : null;
    
    const startFrameSignedUrl = await generateSignedUrl(startFrameStoragePath);
    const endFrameSignedUrl = endFrameStoragePath ? await generateSignedUrl(endFrameStoragePath) : null;

    console.log('Generated signed URLs:', {
      startFrameSignedUrl,
      endFrameSignedUrl,
      correlationId
    });

    // Insert scene record into database
    const { data: scene, error: sceneError } = await supabase
      .from('scenes')
      .insert({
        user_id: user.id,
        project_id: project.id,
        folder: body.folder,
        start_key: startFrameStoragePath,
        end_key: endFrameStoragePath,
        shot_type_id: body.shot_type_id,
        ordinal: nextOrdinal,
        version: 1,
        start_frame_signed_url: startFrameSignedUrl,
        end_frame_signed_url: endFrameSignedUrl,
        signed_url_expires_at: new Date(Date.now() + 10 * 60 * 1000), // 10 minutes
        luma_status: 'pending',
        status: 'queued'
      })
      .select()
      .single();

    if (sceneError || !scene) {
      console.error('Failed to create scene record:', sceneError);
      return new Response(
        JSON.stringify({ 
          error: { 
            code: 'DB_ERROR', 
            message: 'Failed to create scene record',
            correlationId 
          },
          ok: false 
        }),
        { status: 500, headers: responseHeaders }
      );
    }

    console.log('Created scene record:', scene.id);

    // Prepare Luma Dream Machine v1 API payload
    const lumaPayload = {
      prompt: shotType.prompt_template,
      model: "ray-flash-2",
      keyframes: {
        frame0: {
          type: "image",
          url: startFrameSignedUrl
        },
        ...(endFrameSignedUrl ? {
          frame1: {
            type: "image", 
            url: endFrameSignedUrl
          }
        } : {})
      },
      loop: false,
      aspect_ratio: "16:9"
    };

    // Call Luma API
    const lumaResult = await callLumaAPI(lumaPayload, correlationId);
    
    if (!lumaResult.success) {
      // Update scene with error
      await supabase
        .from('scenes')
        .update({ 
          status: 'error',
          luma_status: 'failed',
          luma_error: lumaResult.error
        })
        .eq('id', scene.id);

      // Determine specific error code based on Luma API response
      let errorCode = 'LUMA_API_ERROR';
      let userMessage = 'Scene generation failed';
      
      if (lumaResult.lumaError) {
        const { status, parsed } = lumaResult.lumaError;
        
        if (status === 403) {
          errorCode = 'LUMA_AUTH_ERROR';
          userMessage = 'Authentication failed with Luma API. Please check API key configuration.';
        } else if (status === 429) {
          errorCode = 'LUMA_QUOTA_EXCEEDED';
          userMessage = 'Luma API quota exceeded. Please try again later.';
        } else if (status === 400) {
          errorCode = 'LUMA_VALIDATION_ERROR';
          userMessage = parsed?.detail || parsed?.message || 'Invalid request to Luma API';
        } else if (status >= 500) {
          errorCode = 'LUMA_SERVER_ERROR';
          userMessage = 'Luma API server error. Please try again later.';
        }
      }

      await logError({
        route: '/luma-create-scene',
        method: 'POST',
        status: 502,
        code: errorCode,
        message: lumaResult.error || 'Luma API call failed',
        correlationId,
        userId: user.id,
      });
      
      return new Response(
        JSON.stringify({ 
          error: { 
            code: errorCode, 
            message: userMessage,
            detail: lumaResult.lumaError?.parsed || lumaResult.error,
            correlationId,
            upstream: lumaResult.lumaError ? {
              endpoint: 'Luma API',
              status: lumaResult.lumaError.status,
              bodySnippet: lumaResult.lumaError.body.substring(0, 200)
            } : undefined
          },
          ok: false 
        }),
        { status: 502, headers: responseHeaders }
      );
    }

    // Update scene with Luma job ID
    const { error: updateError } = await supabase
      .from('scenes')
      .update({ 
        luma_job_id: lumaResult.data.id,
        status: 'processing',
        luma_status: 'processing'
      })
      .eq('id', scene.id);

    if (updateError) {
      console.error(`[${correlationId}] Failed to update scene with Luma job ID:`, updateError);
    }

    console.log(`[${correlationId}] Scene created successfully: ${scene.id}, Luma job: ${lumaResult.data.id}`);

    return new Response(
      JSON.stringify({ 
        success: true,
        data: {
          sceneId: scene.id,
          lumaJobId: lumaResult.data.id,
          status: 'processing'
        },
        ok: true 
      }),
      { headers: responseHeaders }
    );

  } catch (error) {
    await logError({
      route: '/luma-create-scene',
      method: 'POST',
      status: 500,
      code: 'INTERNAL_ERROR',
      message: error.message,
      correlationId,
    });
    
    console.error(`[${correlationId}] Unexpected error:`, error);
    return new Response(
      JSON.stringify({ 
        error: { 
          code: 'INTERNAL_ERROR', 
          message: 'Internal server error',
          correlationId 
        },
        ok: false 
      }),
      { status: 500, headers: responseHeaders }
    );
  }
});