import { serve } from "https://deno.land/std@0.190.0/http/server.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS"
};

interface CreateRequest {
  prompt: string;
  model?: string;
  aspect_ratio?: string;
  duration?: number;
  resolution?: string;
  frame0Url?: string;
  frame1Url?: string;
}

serve(async (req) => {
  // Handle CORS preflight
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  // Only allow POST
  if (req.method !== "POST") {
    return new Response(
      JSON.stringify({ error: "Method Not Allowed" }),
      { 
        status: 405, 
        headers: { ...corsHeaders, "Content-Type": "application/json" }
      }
    );
  }

  try {
    const body: CreateRequest = await req.json();

    // Validate required fields
    if (!body.prompt) {
      return new Response(
        JSON.stringify({ error: "Missing prompt" }),
        { 
          status: 400, 
          headers: { ...corsHeaders, "Content-Type": "application/json" }
        }
      );
    }

    // Build Luma API payload with defaults
    const lumaPayload: any = {
      prompt: body.prompt,
      model: body.model || "ray-flash-2",
      aspect_ratio: body.aspect_ratio || "16:9",
      resolution: body.resolution || "1080p"
    };

    // Add duration if provided
    if (body.duration) {
      lumaPayload.duration = body.duration;
    }

    // Add keyframes if frame URLs are provided
    if (body.frame0Url || body.frame1Url) {
      lumaPayload.keyframes = {};
      
      if (body.frame0Url) {
        lumaPayload.keyframes.frame0 = {
          type: "image",
          url: body.frame0Url
        };
      }
      
      if (body.frame1Url) {
        lumaPayload.keyframes.frame1 = {
          type: "image", 
          url: body.frame1Url
        };
      }
    }

    // Call Luma Dream Machine API
    const lumaApiKey = Deno.env.get("LUMAAI_API_KEY");
    const lumaApiBase = Deno.env.get("LUMA_API_BASE") || "https://api.lumalabs.ai/dream-machine/v1";

    if (!lumaApiKey) {
      return new Response(
        JSON.stringify({ error: "LUMAAI_API_KEY not configured" }),
        { 
          status: 500, 
          headers: { ...corsHeaders, "Content-Type": "application/json" }
        }
      );
    }

    console.log(`Calling Luma API with payload:`, JSON.stringify(lumaPayload, null, 2));

    const lumaResponse = await fetch(`${lumaApiBase}/generations`, {
      method: "POST",
      headers: {
        "authorization": `Bearer ${lumaApiKey}`,
        "content-type": "application/json",
        "accept": "application/json"
      },
      body: JSON.stringify(lumaPayload)
    });

    const responseText = await lumaResponse.text();
    console.log(`Luma API response status: ${lumaResponse.status}`);
    console.log(`Luma API response body:`, responseText);

    // Forward the response
    if (!lumaResponse.ok) {
      return new Response(
        JSON.stringify({ 
          error: "LUMA_CREATE_FAILED",
          status: lumaResponse.status,
          details: responseText.slice(0, 400)
        }),
        { 
          status: 502, 
          headers: { ...corsHeaders, "Content-Type": "application/json" }
        }
      );
    }

    // Parse and return successful response
    const lumaData = JSON.parse(responseText);
    
    return new Response(
      responseText,
      { 
        status: 200,
        headers: { ...corsHeaders, "Content-Type": "application/json" }
      }
    );

  } catch (error) {
    console.error("Error in luma-create function:", error);
    
    return new Response(
      JSON.stringify({ 
        error: "Internal server error",
        message: error.message
      }),
      { 
        status: 500, 
        headers: { ...corsHeaders, "Content-Type": "application/json" }
      }
    );
  }
});