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

// HMAC signature verification
function verifySignature(payload: string, signature: string): boolean {
  try {
    const hmac = createHmac("sha256", webhookSecret);
    hmac.update(payload);
    const expectedSignature = `sha256=${hmac.toString("hex")}`;
    return expectedSignature === signature;
  } catch {
    return false;
  }
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const signature = req.headers.get("x-hub-signature-256");
    const payload = await req.text();

    // Verify HMAC signature for security
    if (!signature || !verifySignature(payload, signature)) {
      return new Response(
        JSON.stringify({ error: "Invalid signature" }),
        { 
          status: 401, 
          headers: { ...corsHeaders, "Content-Type": "application/json" } 
        }
      );
    }

    const data = JSON.parse(payload);
    const { sceneId, version, videoUrl, renderMeta, status } = data;

    if (!sceneId || !version) {
      return new Response(
        JSON.stringify({ error: "Missing required fields" }),
        { 
          status: 400, 
          headers: { ...corsHeaders, "Content-Type": "application/json" } 
        }
      );
    }

    // Update scene status
    const { error: sceneError } = await supabase
      .from("scenes")
      .update({ status: status || "ready" })
      .eq("id", sceneId);

    if (sceneError) {
      console.error("Error updating scene:", sceneError);
      return new Response(
        JSON.stringify({ error: "Failed to update scene" }),
        { 
          status: 500, 
          headers: { ...corsHeaders, "Content-Type": "application/json" } 
        }
      );
    }

    // Insert new version
    const { error: versionError } = await supabase
      .from("scene_versions")
      .insert({
        scene_id: sceneId,
        version: version,
        video_url: videoUrl,
        render_meta: renderMeta || {}
      });

    if (versionError) {
      console.error("Error inserting version:", versionError);
      return new Response(
        JSON.stringify({ error: "Failed to insert version" }),
        { 
          status: 500, 
          headers: { ...corsHeaders, "Content-Type": "application/json" } 
        }
      );
    }

    return new Response(
      JSON.stringify({ 
        success: true, 
        message: "Scene version updated successfully" 
      }),
      { 
        headers: { ...corsHeaders, "Content-Type": "application/json" } 
      }
    );

  } catch (error) {
    console.error("Webhook error:", error);
    return new Response(
      JSON.stringify({ error: "Internal server error" }),
      { 
        status: 500, 
        headers: { ...corsHeaders, "Content-Type": "application/json" } 
      }
    );
  }
});