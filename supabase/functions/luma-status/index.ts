import { serve } from "https://deno.land/std@0.190.0/http/server.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

interface LumaStatusResponse {
  id: string;
  state: "queued" | "dreaming" | "completed" | "failed";
  created_at: string;
  video?: {
    url?: string;
    download_url?: string;
  };
  failure_reason?: string;
  progress?: number;
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  if (req.method !== "GET") {
    return new Response(
      JSON.stringify({ 
        error: { message: "Method not allowed" },
        ok: false 
      }),
      { 
        status: 405, 
        headers: { ...corsHeaders, "Content-Type": "application/json" }
      }
    );
  }

  const responseHeaders = { ...corsHeaders, "Content-Type": "application/json" };

  try {
    const url = new URL(req.url);
    const generationId = url.pathname.split('/').pop();

    if (!generationId) {
      return new Response(
        JSON.stringify({ 
          error: { message: "Generation ID is required" },
          ok: false 
        }),
        { status: 400, headers: responseHeaders }
      );
    }

    const lumaApiKey = Deno.env.get("LUMAAI_API_KEY");
    const lumaApiBase = Deno.env.get("LUMA_API_BASE") || "https://api.lumalabs.ai/dream-machine/v1";

    if (!lumaApiKey) {
      return new Response(
        JSON.stringify({ 
          error: { message: "Luma API key not configured" },
          ok: false 
        }),
        { status: 500, headers: responseHeaders }
      );
    }

    const response = await fetch(`${lumaApiBase}/generations/${generationId}`, {
      method: 'GET',
      headers: {
        'authorization': `Bearer ${lumaApiKey}`,
        'accept': 'application/json',
      }
    });

    const responseText = await response.text();
    
    if (!response.ok) {
      console.error(`Luma API error ${response.status}: ${responseText}`);
      return new Response(
        JSON.stringify({ 
          error: { 
            message: `Luma API returned ${response.status}`,
            details: responseText.slice(0, 400)
          },
          ok: false 
        }),
        { status: response.status, headers: responseHeaders }
      );
    }

    const data: LumaStatusResponse = JSON.parse(responseText);
    
    return new Response(
      JSON.stringify({ 
        data,
        ok: true 
      }),
      { headers: responseHeaders }
    );

  } catch (error) {
    console.error("Luma status error:", error);
    return new Response(
      JSON.stringify({ 
        error: { message: "Internal server error" },
        ok: false 
      }),
      { status: 500, headers: responseHeaders }
    );
  }
});