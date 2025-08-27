import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.56.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const lumaApiKey = Deno.env.get("LUMA_API_KEY")!;
const lumaApiBase = Deno.env.get("LUMA_API_BASE") || "https://api.lumalabs.ai";

const supabase = createClient(supabaseUrl, supabaseServiceKey);

async function uploadVideoToStorage(videoUrl: string, userId: string, folder: string, sceneId: string, version: number): Promise<{ success: boolean; videoKey?: string; error?: string }> {
  try {
    console.log(`Downloading video from: ${videoUrl}`);
    
    // Download video from Luma
    const response = await fetch(videoUrl);
    if (!response.ok) {
      throw new Error(`Failed to download video: ${response.status} ${response.statusText}`);
    }
    
    const videoBlob = await response.blob();
    const videoKey = `users/${userId}/Scenes/${folder}/scene-${sceneId}/v${version}.mp4`;
    
    console.log(`Uploading video to storage path: ${videoKey}`);
    
    // Upload to Supabase Storage
    const { error: uploadError } = await supabase.storage
      .from('media')
      .upload(videoKey, videoBlob, {
        contentType: 'video/mp4',
        upsert: true
      });
    
    if (uploadError) {
      throw uploadError;
    }
    
    console.log(`Video uploaded successfully to: ${videoKey}`);
    return { success: true, videoKey };
    
  } catch (error) {
    console.error('Failed to upload video to storage:', error);
    return { success: false, error: error.message };
  }
}

async function pollLumaStatus(jobId: string): Promise<{ success: boolean; data?: any; error?: string }> {
  try {
    console.log(`Polling Luma API for job: ${jobId}`);
    
    const response = await fetch(`${lumaApiBase}/v1/videos/${jobId}`, {
      method: 'GET',
      headers: {
        'Authorization': `Bearer ${lumaApiKey}`,
        'User-Agent': 'PanhandleAI-Dashboard/1.0'
      }
    });
    
    const responseText = await response.text();
    console.log(`Luma status response: ${response.status} - ${responseText}`);
    
    if (!response.ok) {
      return {
        success: false,
        error: `Luma API returned ${response.status}: ${responseText}`
      };
    }
    
    const data = JSON.parse(responseText);
    return { success: true, data };
    
  } catch (error) {
    console.error('Luma status poll failed:', error);
    return {
      success: false,
      error: `Luma status poll failed: ${error.message}`
    };
  }
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  const responseHeaders = { ...corsHeaders, "Content-Type": "application/json" };
  const url = new URL(req.url);
  const sceneId = url.pathname.split('/').pop();

  if (!sceneId) {
    return new Response(
      JSON.stringify({ 
        error: { 
          code: 'MISSING_SCENE_ID', 
          message: 'Scene ID is required' 
        },
        ok: false 
      }),
      { status: 400, headers: responseHeaders }
    );
  }

  try {
    // Authenticate user
    const authHeader = req.headers.get("Authorization");
    if (!authHeader?.startsWith("Bearer ")) {
      return new Response(
        JSON.stringify({ 
          error: { 
            code: 'UNAUTHORIZED', 
            message: 'Missing or invalid authorization header' 
          },
          ok: false 
        }),
        { status: 401, headers: responseHeaders }
      );
    }

    const token = authHeader.split(" ")[1];
    const { data: { user }, error: authError } = await supabase.auth.getUser(token);
    
    if (authError || !user) {
      return new Response(
        JSON.stringify({ 
          error: { 
            code: 'AUTH_ERROR', 
            message: 'Authentication failed' 
          },
          ok: false 
        }),
        { status: 401, headers: responseHeaders }
      );
    }

    // Get scene
    const { data: scene, error: sceneError } = await supabase
      .from('scenes')
      .select('*')
      .eq('id', sceneId)
      .eq('user_id', user.id)
      .single();

    if (sceneError || !scene) {
      return new Response(
        JSON.stringify({ 
          error: { 
            code: 'SCENE_NOT_FOUND', 
            message: 'Scene not found or not owned by user' 
          },
          ok: false 
        }),
        { status: 404, headers: responseHeaders }
      );
    }

    // If already terminal, return immediately
    if (scene.luma_status === 'completed' || scene.luma_status === 'error') {
      return new Response(
        JSON.stringify({ 
          success: true,
          data: {
            sceneId: scene.id,
            status: scene.status,
            lumaStatus: scene.luma_status,
            lumaError: scene.luma_error,
            isTerminal: true
          },
          ok: true 
        }),
        { headers: responseHeaders }
      );
    }

    // Poll Luma API
    if (!scene.luma_job_id) {
      return new Response(
        JSON.stringify({ 
          error: { 
            code: 'NO_LUMA_JOB', 
            message: 'Scene has no Luma job ID' 
          },
          ok: false 
        }),
        { status: 400, headers: responseHeaders }
      );
    }

    const lumaResult = await pollLumaStatus(scene.luma_job_id);
    
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

      return new Response(
        JSON.stringify({ 
          success: true,
          data: {
            sceneId: scene.id,
            status: 'error',
            lumaStatus: 'error',
            lumaError: lumaResult.error,
            isTerminal: true
          },
          ok: true 
        }),
        { headers: responseHeaders }
      );
    }

    const lumaData = lumaResult.data;
    let updateData: any = {};

    // Handle different Luma statuses
    switch (lumaData.state) {
      case 'queued':
      case 'running':
        updateData = {
          luma_status: lumaData.state,
          status: 'running'
        };
        break;
        
      case 'failed':
        updateData = {
          luma_status: 'error',
          status: 'error',
          luma_error: lumaData.failure_reason || 'Luma generation failed'
        };
        break;
        
      case 'completed':
        if (lumaData.video?.url) {
          // Upload video to storage
          const uploadResult = await uploadVideoToStorage(
            lumaData.video.url,
            user.id,
            scene.folder,
            scene.id,
            1 // version
          );

          if (uploadResult.success) {
            // Insert scene version
            const { error: versionError } = await supabase
              .from('scene_versions')
              .insert({
                scene_id: scene.id,
                version: 1,
                video_key: uploadResult.videoKey,
                render_meta: {
                  luma_job_id: scene.luma_job_id,
                  luma_response: lumaData,
                  created_at: new Date().toISOString()
                }
              });

            if (versionError) {
              console.error('Failed to insert scene version:', versionError);
            }

            updateData = {
              luma_status: 'completed',
              status: 'ready'
            };
          } else {
            updateData = {
              luma_status: 'error',
              status: 'error',
              luma_error: `Failed to upload video: ${uploadResult.error}`
            };
          }
        } else {
          updateData = {
            luma_status: 'error',
            status: 'error',
            luma_error: 'Luma completed but no video URL provided'
          };
        }
        break;
        
      default:
        console.warn(`Unknown Luma state: ${lumaData.state}`);
        updateData = {
          luma_status: lumaData.state || 'unknown'
        };
    }

    // Update scene
    const { error: updateError } = await supabase
      .from('scenes')
      .update(updateData)
      .eq('id', sceneId);

    if (updateError) {
      console.error('Failed to update scene:', updateError);
    }

    return new Response(
      JSON.stringify({ 
        success: true,
        data: {
          sceneId: scene.id,
          status: updateData.status || scene.status,
          lumaStatus: updateData.luma_status,
          lumaError: updateData.luma_error,
          progress: lumaData.progress || null,
          isTerminal: ['completed', 'error'].includes(updateData.luma_status)
        },
        ok: true 
      }),
      { headers: responseHeaders }
    );

  } catch (error) {
    console.error('Unexpected error:', error);
    return new Response(
      JSON.stringify({ 
        error: { 
          code: 'INTERNAL_ERROR', 
          message: 'Internal server error' 
        },
        ok: false 
      }),
      { status: 500, headers: responseHeaders }
    );
  }
});