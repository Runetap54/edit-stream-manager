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
const lumaApiBase = Deno.env.get("LUMA_API_BASE") || "https://api.lumalabs.ai";
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

async function callLumaAPI(payload: any, correlationId: string): Promise<{ success: boolean; data?: any; error?: string }> {
  try {
    console.log(`[${correlationId}] Calling Luma API with payload:`, JSON.stringify(payload, null, 2));
    
    const response = await fetch(`${lumaApiBase}/v1/videos`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${lumaApiKey}`,
        'Content-Type': 'application/json',
        'User-Agent': 'PanhandleAI-Dashboard/1.0'
      },
      body: JSON.stringify(payload)
    });
    
    const responseText = await response.text();
    console.log(`[${correlationId}] Luma API response status: ${response.status}`);
    console.log(`[${correlationId}] Luma API response body: ${responseText}`);
    
    if (!response.ok) {
      return {
        success: false,
        error: `Luma API returned ${response.status}: ${responseText}`
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

    // Get shot type
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

    // Generate signed URLs for media
    const startStoragePath = extractStoragePath(body.start_key);
    const startSignedUrl = await generateSignedUrl(startStoragePath);
    
    if (!startSignedUrl) {
      await logError({
        route: '/luma-create-scene',
        method: 'POST',
        status: 500,
        code: 'SIGNED_URL_ERROR',
        message: 'Failed to generate signed URL for start frame',
        correlationId,
        userId: user.id,
      });
      
      return new Response(
        JSON.stringify({ 
          error: { 
            code: 'SIGNED_URL_ERROR', 
            message: 'Failed to generate signed URL for start frame',
            correlationId 
          },
          ok: false 
        }),
        { status: 500, headers: responseHeaders }
      );
    }

    let endSignedUrl = null;
    if (body.end_key) {
      const endStoragePath = extractStoragePath(body.end_key);
      endSignedUrl = await generateSignedUrl(endStoragePath);
    }

    // Create scene record
    const sceneId = uuidv4();
    const { error: sceneInsertError } = await supabase
      .from('scenes')
      .insert({
        id: sceneId,
        user_id: user.id,
        folder: body.folder,
        start_key: body.start_key,
        end_key: body.end_key,
        start_frame_signed_url: startSignedUrl,
        end_frame_signed_url: endSignedUrl,
        signed_url_expires_at: new Date(Date.now() + signedUrlTtl * 1000).toISOString(),
        shot_type: 1, // Default value for compatibility
        status: 'queued',
        luma_status: 'pending'
      });

    if (sceneInsertError) {
      await logError({
        route: '/luma-create-scene',
        method: 'POST',
        status: 500,
        code: 'DB_INSERT_ERROR',
        message: 'Failed to create scene record',
        correlationId,
        userId: user.id,
        safeContext: { error: sceneInsertError.message }
      });
      
      return new Response(
        JSON.stringify({ 
          error: { 
            code: 'DB_INSERT_ERROR', 
            message: 'Failed to create scene record',
            correlationId 
          },
          ok: false 
        }),
        { status: 500, headers: responseHeaders }
      );
    }

    // Prepare Luma API payload
    const lumaPayload = {
      prompt: shotType.prompt_template,
      keyframes: {
        frame0: {
          type: "image",
          url: startSignedUrl
        }
      }
    };

    if (endSignedUrl) {
      lumaPayload.keyframes.frame1 = {
        type: "image", 
        url: endSignedUrl
      };
    }

    // Call Luma API
    const lumaResult = await callLumaAPI(lumaPayload, correlationId);
    
    if (!lumaResult.success) {
      // Update scene with error
      await supabase
        .from('scenes')
        .update({ 
          status: 'error',
          luma_status: 'error',
          luma_error: lumaResult.error
        })
        .eq('id', sceneId);

      await logError({
        route: '/luma-create-scene',
        method: 'POST',
        status: 502,
        code: 'LUMA_API_ERROR',
        message: lumaResult.error || 'Luma API call failed',
        correlationId,
        userId: user.id,
      });
      
      return new Response(
        JSON.stringify({ 
          error: { 
            code: 'LUMA_API_ERROR', 
            message: 'Scene generation failed',
            correlationId 
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
        status: 'running',
        luma_status: 'running'
      })
      .eq('id', sceneId);

    if (updateError) {
      console.error(`[${correlationId}] Failed to update scene with Luma job ID:`, updateError);
    }

    console.log(`[${correlationId}] Scene created successfully: ${sceneId}, Luma job: ${lumaResult.data.id}`);

    return new Response(
      JSON.stringify({ 
        success: true,
        data: {
          sceneId,
          lumaJobId: lumaResult.data.id,
          status: 'running'
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