import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.56.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

const supabase = createClient(supabaseUrl, supabaseServiceKey);

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const url = new URL(req.url);
    const token = url.searchParams.get("token");
    const action = url.pathname.includes("approve") ? "approve" : "reject";

    if (!token) {
      return new Response("Invalid or missing token", { status: 400 });
    }

    // Validate token
    const { data: approvalData, error: tokenError } = await supabase
      .from("admin_approvals")
      .select("*")
      .eq("token", token)
      .eq("action", action)
      .is("used_at", null)
      .gt("expires_at", new Date().toISOString())
      .single();

    if (tokenError || !approvalData) {
      return new Response(`
        <!DOCTYPE html>
        <html>
        <head>
          <title>Invalid Token</title>
          <style>
            body { font-family: Arial, sans-serif; text-align: center; padding: 50px; }
            .error { color: #ef4444; }
          </style>
        </head>
        <body>
          <h1 class="error">Invalid or Expired Token</h1>
          <p>This approval link is invalid or has expired.</p>
        </body>
        </html>
      `, {
        status: 400,
        headers: { "Content-Type": "text/html" }
      });
    }

    // Mark token as used
    await supabase
      .from("admin_approvals")
      .update({ used_at: new Date().toISOString() })
      .eq("id", approvalData.id);

    // Update user status
    const newStatus = action === "approve" ? "approved" : "rejected";
    const { error: updateError } = await supabase
      .from("profiles")
      .update({ status: newStatus })
      .eq("id", approvalData.user_id);

    if (updateError) {
      console.error("Error updating profile:", updateError);
      return new Response("Error updating user status", { status: 500 });
    }

    // Success page
    const statusColor = action === "approve" ? "#10b981" : "#ef4444";
    const statusText = action === "approve" ? "Approved" : "Rejected";
    const description = action === "approve" 
      ? "The user can now sign in and access the VideoStream dashboard."
      : "The user has been rejected and cannot access the system.";

    return new Response(`
      <!DOCTYPE html>
      <html>
      <head>
        <title>User ${statusText}</title>
        <style>
          body { 
            font-family: Arial, sans-serif; 
            text-align: center; 
            padding: 50px; 
            background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
            color: white;
            min-height: 100vh;
            margin: 0;
            display: flex;
            align-items: center;
            justify-content: center;
          }
          .container {
            background: white;
            color: #333;
            padding: 40px;
            border-radius: 12px;
            box-shadow: 0 20px 50px rgba(0,0,0,0.1);
          }
          .status { color: ${statusColor}; font-size: 48px; margin-bottom: 20px; }
          h1 { color: ${statusColor}; }
        </style>
      </head>
      <body>
        <div class="container">
          <div class="status">✓</div>
          <h1>User ${statusText} Successfully</h1>
          <p>${description}</p>
          <p><small>You can close this window.</small></p>
        </div>
      </body>
      </html>
    `, {
      headers: { "Content-Type": "text/html" }
    });

  } catch (error) {
    console.error("Admin action error:", error);
    return new Response("Internal server error", { status: 500 });
  }
});