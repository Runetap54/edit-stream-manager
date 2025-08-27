import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.56.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-correlation-id",
};

const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const webhookSecret = Deno.env.get("N8N_WEBHOOK_SECRET")!;
const renderWebhookUrl = Deno.env.get("N8N_RENDER_WEBHOOK_URL")!;

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

// Validate schema for new URL-based approach
function validateSceneRequest(body: any): { isValid: boolean; errors: string[] } {
  const errors: string[] = [];
  
  if (!body.generationId || typeof body.generationId !== 'string') {
    errors.push('generationId is required and must be a string');
  }
  
  if (!body.sceneId || typeof body.sceneId !== 'string') {
    errors.push('sceneId is required and must be a string');
  }
  
  if (!body.startFrameUrl || typeof body.startFrameUrl !== 'string') {
    errors.push('startFrameUrl is required and must be a string');
  }
  
  if (body.endFrameUrl && typeof body.endFrameUrl !== 'string') {
    errors.push('endFrameUrl must be a string');
  }
  
  if (!body.shotType || typeof body.shotType !== 'number' || body.shotType < 1 || body.shotType > 6) {
    errors.push('shotType must be a number between 1 and 6');
  }
  
  // Validate URLs
  if (body.startFrameUrl && !body.startFrameUrl.startsWith('http')) {
    errors.push('startFrameUrl must be a valid URL');
  }
  
  if (body.endFrameUrl && !body.endFrameUrl.startsWith('http')) {
    errors.push('endFrameUrl must be a valid URL');
  }
  
  return { isValid: errors.length === 0, errors };
}

// HMAC signature generation
async function generateSignature(payload: string): Promise<string> {
  const encoder = new TextEncoder();
  const key = await crypto.subtle.importKey(
    "raw",
    encoder.encode(webhookSecret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"]
  );
  
  const signature = await crypto.subtle.sign("HMAC", key, encoder.encode(payload));
  const hexString = Array.from(new Uint8Array(signature))
    .map(b => b.toString(16).padStart(2, '0'))
    .join('');
  
  return `sha256=${hexString}`;
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
    let body;
    try {
      body = await req.json();
    } catch (parseError) {
      await logError({
        route: '/create-scene',
        method: 'POST',
        status: 400,
        code: 'VALIDATION_ERROR',
        message: 'Invalid JSON in request body',
        correlationId,
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

    // Validate request body
    const validation = validateSceneRequest(body);
    if (!validation.isValid) {
      await logError({
        route: '/create-scene',  
        method: 'POST',
        status: 400,
        code: 'VALIDATION_ERROR',
        message: validation.errors.join('; '),
        correlationId,
        safeContext: { validationErrors: validation.errors }
      });
      
      return new Response(
        JSON.stringify({ 
          error: { 
            code: 'VALIDATION_ERROR', 
            message: 'Invalid request data',
            detail: { fields: validation.errors },
            correlationId 
          },
          ok: false 
        }),
        { status: 400, headers: responseHeaders }
      );
    }

    const { generationId, sceneId, startFrameUrl, endFrameUrl, shotType } = body;
    
    // Get user from auth
    const authHeader = req.headers.get("authorization");
    if (!authHeader) {
      await logError({
        route: '/create-scene',
        method: 'POST', 
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
        route: '/create-scene',
        method: 'POST',
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

    // Validate user is approved
    const { data: profile } = await supabase
      .from("profiles")
      .select("status")
      .eq("id", user.id)
      .single();

    if (!profile || profile.status !== "approved") {
      await logError({
        route: '/create-scene',
        method: 'POST',
        status: 403,
        code: 'FORBIDDEN_ERROR',
        message: 'User account not approved',
        correlationId,
        userId: user.id,
        safeContext: { userStatus: profile?.status || 'not_found' }
      });
      
      return new Response(
        JSON.stringify({ 
          error: { 
            code: 'FORBIDDEN_ERROR', 
            message: 'Your account is pending admin approval',
            correlationId 
          },
          ok: false 
        }),
        { status: 403, headers: responseHeaders }
      );
    }

// Convert CDN URLs to storage paths
    const extractStoragePath = (cdnUrl: string): string => {
      try {
        const url = new URL(cdnUrl);
        const pathParts = url.pathname.split('/');
        const objectIndex = pathParts.findIndex(part => part === 'object');
        if (objectIndex === -1) return '';
        return pathParts.slice(objectIndex + 2).join('/');
      } catch {
        return '';
      }
    };

    const generateSignedUrl = async (storagePath: string): Promise<string | null> => {
      try {
        const { data, error } = await supabase.storage
          .from('media')
          .createSignedUrl(storagePath, 604800); // 1 week
        return error ? null : data.signedUrl;
      } catch {
        return null;
      }
    };

    const startStoragePath = extractStoragePath(startFrameUrl);
    const endStoragePath = endFrameUrl ? extractStoragePath(endFrameUrl) : null;

    // Generate 1-week signed URLs
    const startSignedUrl = await generateSignedUrl(startStoragePath);
    const endSignedUrl = endStoragePath ? await generateSignedUrl(endStoragePath) : null;

    if (!startSignedUrl) {
      await logError({
        route: '/create-scene',
        method: 'POST',
        status: 400,
        code: 'INVALID_URL',
        message: 'Failed to generate signed URL for start frame',
        correlationId,
        userId: user.id,
        safeContext: { startFrameUrl, startStoragePath }
      });
      
      return new Response(
        JSON.stringify({ 
          error: { 
            code: 'INVALID_URL', 
            message: 'Invalid start frame URL',
            correlationId 
          },
          ok: false 
        }),
        { status: 400, headers: responseHeaders }
      );
    }

    // Calculate expiry date (1 week from now)
    const expiresAt = new Date();
    expiresAt.setDate(expiresAt.getDate() + 7);

    // Create scene record with storage paths and signed URLs
    const { data: scene, error: sceneError } = await supabase
      .from("scenes")
      .insert({
        id: sceneId,
        user_id: user.id,
        folder: `scenes-${Date.now()}`,
        start_key: startStoragePath,
        end_key: endStoragePath,
        start_frame_signed_url: startSignedUrl,
        end_frame_signed_url: endSignedUrl,
        signed_url_expires_at: expiresAt.toISOString(),
        shot_type: shotType,
        status: "queued"
      })
      .select()
      .single();

    if (sceneError || !scene) {
      await logError({
        route: '/create-scene',
        method: 'POST',
        status: 500,
        code: 'SERVER_ERROR',
        message: 'Failed to create scene record',
        correlationId,
        userId: user.id,
        safeContext: { 
          generationId,
          sceneId,
          shotType,
          dbError: sceneError?.message,
          dbCode: sceneError?.code 
        }
      });
      
      return new Response(
        JSON.stringify({ 
          error: { 
            code: 'SERVER_ERROR', 
            message: 'Failed to create scene',
            correlationId 
          },
          ok: false 
        }),
        { status: 500, headers: responseHeaders }
      );
    }

    // Prepare webhook payload for n8n with signed URLs
    const webhookPayload = {
      sceneId: sceneId,
      generationId: generationId,
      startFrameUrl: startSignedUrl,
      endFrameUrl: endSignedUrl,
      shotType: shotType,
      userId: user.id,
      timestamp: new Date().toISOString(),
      correlationId
    };

    const payloadString = JSON.stringify(webhookPayload);
    const signature = await generateSignature(payloadString);

    // Send to n8n render webhook with timeout
    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 20000); // 20 second timeout

      const n8nResponse = await fetch(renderWebhookUrl, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "X-Hub-Signature-256": signature,
          "x-correlation-id": correlationId
        },
        body: payloadString,
        signal: controller.signal
      });

      clearTimeout(timeoutId);

      if (!n8nResponse.ok) {
        const errorBody = await n8nResponse.text().catch(() => 'Unable to read response');
        
        await logError({
          route: '/create-scene',
          method: 'POST', 
          status: 502,
          code: 'N8N_RENDER_FAILED',
          message: `n8n webhook returned ${n8nResponse.status}`,
          correlationId,
          userId: user.id,
          safeContext: { 
            webhookUrl: renderWebhookUrl,
            upstreamStatus: n8nResponse.status,
            upstreamBody: errorBody.substring(0, 500),
            sceneId: scene.id
          }
        });
        
        return new Response(
          JSON.stringify({ 
            error: { 
              code: 'N8N_RENDER_FAILED', 
              message: 'Render service is unreachable',
              detail: { status: n8nResponse.status, endpoint: renderWebhookUrl },
              correlationId 
            },
            ok: false 
          }),
          { status: 502, headers: responseHeaders }
        );
      }
    } catch (n8nError: any) {
      await logError({
        route: '/create-scene',
        method: 'POST',
        status: 502, 
        code: 'N8N_RENDER_FAILED',
        message: `n8n webhook error: ${n8nError.message}`,
        correlationId,
        userId: user.id,
        safeContext: { 
          webhookUrl: renderWebhookUrl,
          errorType: n8nError.name,
          sceneId: scene.id
        }
      });
      
      return new Response(
        JSON.stringify({ 
          error: { 
            code: 'N8N_RENDER_FAILED', 
            message: 'Render service is unreachable',
            detail: { endpoint: renderWebhookUrl },
            correlationId 
          },
          ok: false 
        }),
        { status: 502, headers: responseHeaders }
      );
    }

    return new Response(
      JSON.stringify({ 
        success: true, 
        sceneId: scene.id,
        generationId: generationId,
        message: "Scene creation started",
        ok: true
      }),
      { headers: responseHeaders }
    );

  } catch (error: any) {
    await logError({
      route: '/create-scene',
      method: 'POST',
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