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
        safe_context: params.safeContext || {}
      });
    
    console.error(`[${params.correlationId}] ${params.method} ${params.route} - ${params.status} ${params.code}: ${params.message}`);
  } catch (error) {
    console.error('Failed to log error:', error);
  }
}

// Validate status update request
function validateStatusRequest(body: any): { isValid: boolean; errors: string[] } {
  const errors: string[] = [];
  
  if (!body.generationId || typeof body.generationId !== 'string') {
    errors.push('generationId is required and must be a string');
  }
  
  if (!body.status || typeof body.status !== 'string') {
    errors.push('status is required and must be a string');
  }
  
  const validStatuses = ['queued', 'processing', 'completed', 'error'];
  if (body.status && !validStatuses.includes(body.status)) {
    errors.push(`status must be one of: ${validStatuses.join(', ')}`);
  }
  
  if (body.progress_pct !== undefined && (typeof body.progress_pct !== 'number' || body.progress_pct < 0 || body.progress_pct > 100)) {
    errors.push('progress_pct must be a number between 0 and 100');
  }
  
  if (body.video_url && typeof body.video_url !== 'string') {
    errors.push('video_url must be a string');
  }
  
  if (body.error_code && typeof body.error_code !== 'string') {
    errors.push('error_code must be a string');
  }
  
  if (body.error_message && typeof body.error_message !== 'string') {
    errors.push('error_message must be a string');
  }
  
  return { isValid: errors.length === 0, errors };
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
        route: '/scene-status',
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
    const validation = validateStatusRequest(body);
    if (!validation.isValid) {
      await logError({
        route: '/scene-status',  
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

    const { generationId, status, progress_pct, video_url, error_code, error_message } = body;
    
    // Update scene generation status
    const updateData: any = { 
      status,
      updated_at: new Date().toISOString()
    };
    
    if (progress_pct !== undefined) updateData.progress_pct = progress_pct;
    if (video_url !== undefined) updateData.video_url = video_url;
    if (error_code !== undefined) updateData.error_code = error_code;
    if (error_message !== undefined) updateData.error_message = error_message;

    const { data: generation, error: updateError } = await supabase
      .from("scene_generations")
      .update(updateData)
      .eq("generation_id", generationId)
      .select()
      .single();

    if (updateError) {
      await logError({
        route: '/scene-status',
        method: 'POST',
        status: 500,
        code: 'SERVER_ERROR',
        message: 'Failed to update scene generation',
        correlationId,
        safeContext: { 
          generationId,
          status,
          dbError: updateError.message,
          dbCode: updateError.code 
        }
      });
      
      return new Response(
        JSON.stringify({ 
          error: { 
            code: 'SERVER_ERROR', 
            message: 'Failed to update scene generation',
            correlationId 
          },
          ok: false 
        }),
        { status: 500, headers: responseHeaders }
      );
    }

    if (!generation) {
      await logError({
        route: '/scene-status',
        method: 'POST',
        status: 404,
        code: 'NOT_FOUND',
        message: 'Scene generation not found',
        correlationId,
        safeContext: { generationId }
      });
      
      return new Response(
        JSON.stringify({ 
          error: { 
            code: 'NOT_FOUND', 
            message: 'Scene generation not found',
            correlationId 
          },
          ok: false 
        }),
        { status: 404, headers: responseHeaders }
      );
    }

    console.log(`[${correlationId}] Updated generation ${generationId} to status: ${status}`);

    return new Response(
      JSON.stringify({ 
        success: true, 
        generationId: generation.generation_id,
        status: generation.status,
        message: "Status updated successfully",
        ok: true
      }),
      { headers: responseHeaders }
    );

  } catch (error: any) {
    await logError({
      route: '/scene-status',
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