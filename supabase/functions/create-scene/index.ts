import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.56.0";
import { createHmac } from "https://deno.land/std@0.190.0/crypto/mod.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const webhookSecret = Deno.env.get("N8N_WEBHOOK_SECRET")!;

const supabase = createClient(supabaseUrl, supabaseServiceKey);

// HMAC signature generation
function generateSignature(payload: string): string {
  const hmac = createHmac("sha256", webhookSecret);
  hmac.update(payload);
  return `sha256=${hmac.toString("hex")}`;
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { folder, startKey, endKey, shotType } = await req.json();
    
    // Get user from auth
    const authHeader = req.headers.get("authorization");
    if (!authHeader) {
      return new Response(
        JSON.stringify({ error: "Missing authorization" }),
        { 
          status: 401, 
          headers: { ...corsHeaders, "Content-Type": "application/json" } 
        }
      );
    }

    const token = authHeader.replace("Bearer ", "");
    const { data: { user }, error: authError } = await supabase.auth.getUser(token);

    if (authError || !user) {
      return new Response(
        JSON.stringify({ error: "Invalid authorization" }),
        { 
          status: 401, 
          headers: { ...corsHeaders, "Content-Type": "application/json" } 
        }
      );
    }

    // Validate user is approved
    const { data: profile } = await supabase
      .from("profiles")
      .select("status")
      .eq("id", user.id)
      .single();

    if (!profile || profile.status !== "approved") {
      return new Response(
        JSON.stringify({ error: "User not approved" }),
        { 
          status: 403, 
          headers: { ...corsHeaders, "Content-Type": "application/json" } 
        }
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
      console.error("Error creating scene:", sceneError);
      return new Response(
        JSON.stringify({ error: "Failed to create scene" }),
        { 
          status: 500, 
          headers: { ...corsHeaders, "Content-Type": "application/json" } 
        }
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
      timestamp: new Date().toISOString()
    };

    const payloadString = JSON.stringify(webhookPayload);
    const signature = generateSignature(payloadString);

    // Send to n8n render webhook (placeholder URL)
    try {
      const n8nResponse = await fetch("https://your-n8n-instance.com/webhook/render", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "X-Hub-Signature-256": signature
        },
        body: payloadString
      });

      if (!n8nResponse.ok) {
        console.warn("n8n webhook failed, but scene was created");
      }
    } catch (n8nError) {
      console.warn("n8n webhook error:", n8nError);
      // Don't fail the request if n8n is unavailable
    }

    return new Response(
      JSON.stringify({ 
        success: true, 
        sceneId: scene.id,
        message: "Scene creation started" 
      }),
      { 
        headers: { ...corsHeaders, "Content-Type": "application/json" } 
      }
    );

  } catch (error) {
    console.error("Create scene error:", error);
    return new Response(
      JSON.stringify({ error: "Internal server error" }),
      { 
        status: 500, 
        headers: { ...corsHeaders, "Content-Type": "application/json" } 
      }
    );
  }
});