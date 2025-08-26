import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.56.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const smtpUser = Deno.env.get("SMTP_USER")!;
const smtpPass = Deno.env.get("SMTP_PASS")!;

const supabase = createClient(supabaseUrl, supabaseServiceKey);

interface EmailData {
  to: string;
  subject: string;
  html: string;
}

async function sendEmail(emailData: EmailData): Promise<boolean> {
  try {
    const response = await fetch("https://api.gmail.com/gmail/v1/users/me/messages/send", {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${smtpPass}`, // Gmail App Password or OAuth token
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        raw: btoa(
          `To: ${emailData.to}\r\n` +
          `Subject: ${emailData.subject}\r\n` +
          `Content-Type: text/html; charset=utf-8\r\n` +
          `\r\n` +
          emailData.html
        ).replace(/\+/g, '-').replace(/\//g, '_')
      })
    });

    return response.ok;
  } catch (error) {
    console.error("Email sending error:", error);
    return false;
  }
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { userId } = await req.json();

    if (!userId) {
      return new Response(
        JSON.stringify({ error: "User ID is required" }),
        { 
          status: 400, 
          headers: { ...corsHeaders, "Content-Type": "application/json" } 
        }
      );
    }

    // Get user profile
    const { data: profile, error: profileError } = await supabase
      .from("profiles")
      .select("*")
      .eq("id", userId)
      .single();

    if (profileError || !profile) {
      return new Response(
        JSON.stringify({ error: "Profile not found" }),
        { 
          status: 404, 
          headers: { ...corsHeaders, "Content-Type": "application/json" } 
        }
      );
    }

    // Create approval tokens
    const { data: approveToken, error: approveError } = await supabase
      .from("admin_approvals")
      .insert({
        user_id: userId,
        action: "approve"
      })
      .select("token")
      .single();

    const { data: rejectToken, error: rejectError } = await supabase
      .from("admin_approvals")
      .insert({
        user_id: userId,
        action: "reject"
      })
      .select("token")
      .single();

    if (approveError || rejectError || !approveToken || !rejectToken) {
      return new Response(
        JSON.stringify({ error: "Failed to create approval tokens" }),
        { 
          status: 500, 
          headers: { ...corsHeaders, "Content-Type": "application/json" } 
        }
      );
    }

    // Construct email
    const baseUrl = req.headers.get("origin") || supabaseUrl;
    const approveUrl = `${baseUrl}/api/admin/approve?token=${approveToken.token}`;
    const rejectUrl = `${baseUrl}/api/admin/reject?token=${rejectToken.token}`;

    const emailHtml = `
      <!DOCTYPE html>
      <html>
      <head>
        <style>
          body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; }
          .container { max-width: 600px; margin: 0 auto; padding: 20px; }
          .header { background: linear-gradient(135deg, #a855f7, #f59e0b); color: white; padding: 20px; border-radius: 8px 8px 0 0; }
          .content { background: #f9fafb; padding: 20px; border-radius: 0 0 8px 8px; }
          .button { display: inline-block; padding: 12px 24px; margin: 10px 5px; text-decoration: none; border-radius: 6px; font-weight: bold; }
          .approve { background: #10b981; color: white; }
          .reject { background: #ef4444; color: white; }
          .user-info { background: white; padding: 15px; border-radius: 6px; margin: 15px 0; }
        </style>
      </head>
      <body>
        <div class="container">
          <div class="header">
            <h2>VideoStream - New User Approval Required</h2>
          </div>
          <div class="content">
            <p>A new user has signed up for VideoStream and requires admin approval.</p>
            
            <div class="user-info">
              <strong>User Details:</strong><br>
              Email: ${profile.email}<br>
              Registration Date: ${new Date(profile.created_at).toLocaleDateString()}<br>
              Status: ${profile.status}
            </div>

            <p>Please review and take action:</p>
            
            <div style="text-align: center; margin: 30px 0;">
              <a href="${approveUrl}" class="button approve">✓ Approve User</a>
              <a href="${rejectUrl}" class="button reject">✗ Reject User</a>
            </div>

            <p><small>These links will expire in 48 hours for security.</small></p>
          </div>
        </div>
      </body>
      </html>
    `;

    // Send email
    const emailSent = await sendEmail({
      to: "hello@panhandle-ai.com",
      subject: "VideoStream - New User Approval Required",
      html: emailHtml
    });

    if (!emailSent) {
      return new Response(
        JSON.stringify({ error: "Failed to send notification email" }),
        { 
          status: 500, 
          headers: { ...corsHeaders, "Content-Type": "application/json" } 
        }
      );
    }

    return new Response(
      JSON.stringify({ 
        success: true, 
        message: "Admin notification sent successfully" 
      }),
      { 
        headers: { ...corsHeaders, "Content-Type": "application/json" } 
      }
    );

  } catch (error) {
    console.error("Admin notify error:", error);
    return new Response(
      JSON.stringify({ error: "Internal server error" }),
      { 
        status: 500, 
        headers: { ...corsHeaders, "Content-Type": "application/json" } 
      }
    );
  }
});