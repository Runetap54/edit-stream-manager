import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.56.0";
import { createHmac } from "https://deno.land/std@0.190.0/crypto/mod.ts";

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

// Validate schema
function validateSceneRequest(body: any): { isValid: boolean; errors: string[] } {
  const errors: string[] = [];
  
  if (!body.folder || typeof body.folder !== 'string') {
    errors.push('folder is required and must be a string');
  }
  
  if (!body.startKey || typeof body.startKey !== 'string') {
    errors.push('startKey is required and must be a string');
  }
  
  if (body.endKey && typeof body.endKey !== 'string') {
    errors.push('endKey must be a string');
  }
  
  if (!body.shotType || typeof body.shotType !== 'number' || body.shotType < 1 || body.shotType > 6) {
    errors.push('shotType must be a number between 1 and 6');
  }
  
  return { isValid: errors.length === 0, errors };
}

// Validate storage keys belong to user
function validateStorageKeys(userId: string, folder: string, keys: string[]): boolean {
  const expectedPrefix = `${userId}/projects/${folder}/photos/`;
  return keys.every(key => key.startsWith(expectedPrefix));
}

// HMAC signature generation
function generateSignature(payload: string): string {
  const hmac = createHmac("sha256", webhookSecret);
  hmac.update(payload);
  return `sha256=${hmac.toString("hex")}`;
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

    const { folder, startKey, endKey, shotType } = body;
    
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

    // Validate storage keys belong to user
    const keysToValidate = [startKey, ...(endKey ? [endKey] : [])];
    if (!validateStorageKeys(user.id, folder, keysToValidate)) {
      await logError({
        route: '/create-scene',
        method: 'POST',
        status: 403,
        code: 'RLS_DENIED',
        message: 'Storage keys do not belong to user project',
        correlationId,
        userId: user.id,
        safeContext: { folder, keysCount: keysToValidate.length }
      });
      
      return new Response(
        JSON.stringify({ 
          error: { 
            code: 'RLS_DENIED', 
            message: 'You are not allowed to access these files',
            correlationId 
          },
          ok: false 
        }),
        { status: 403, headers: responseHeaders }
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

    // Create scene record
    const { data: scene, error: sceneError } = await supabase
      .from("scenes")
      .insert({
        user_id: user.id,
        folder,
        start_key: startKey,
        end_key: endKey,
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
          folder, 
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

    // Prepare webhook payload for n8n
    const webhookPayload = {
      sceneId: scene.id,
      userId: user.id,
      folder,
      startKey,
      endKey,
      shotType,
      timestamp: new Date().toISOString(),
      correlationId
    };

    const payloadString = JSON.stringify(webhookPayload);
    const signature = generateSignature(payloadString);

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