import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.56.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const lumaApiKey = Deno.env.get("LUMA_API_KEY")!;
const lumaApiBase = Deno.env.get("LUMA_API_BASE") || "https://api.lumalabs.ai/dream-machine/v1";

const supabase = createClient(supabaseUrl, supabaseServiceKey);

async function uploadVideoToStorage(videoUrl: string, userId: string, folder: string, sceneId: string, version: number): Promise<{ success: boolean; videoKey?: string; error?: string }> {
  try {
    console.log(`Downloading video from: ${videoUrl}`);
    
    // Get scene to find ordinal
    const { data: scene, error: sceneError } = await supabase
      .from('scenes')
      .select('ordinal')
      .eq('id', sceneId)
      .single();

    if (sceneError || !scene) {
      return {
        success: false,
        error: `Failed to get scene ordinal: ${sceneError?.message}`
      };
    }

    const fileName = `scene-${scene.ordinal}-v${version}.mp4`;
    const filePath = `users/${userId}/Scenes/${folder}/${fileName}`;
    
    // Download video from Luma
    const response = await fetch(videoUrl);
    if (!response.ok) {
      throw new Error(`Failed to download video: ${response.status} ${response.statusText}`);
    }
    
    const videoBlob = await response.blob();
    
    console.log(`Uploading video to storage path: ${filePath}`);
    
    // Upload to Supabase Storage
    const { error: uploadError } = await supabase.storage
      .from('media')
      .upload(filePath, videoBlob, {
        contentType: 'video/mp4',
        upsert: true
      });
    
    if (uploadError) {
      throw uploadError;
    }
    
    console.log(`Video uploaded successfully to: ${filePath}`);
    return { success: true, videoKey: filePath };
    
  } catch (error) {
    console.error('Failed to upload video to storage:', error);
    return { success: false, error: error.message };
  }
}

async function pollLumaStatus(jobId: string): Promise<{ success: boolean; data?: any; error?: string }> {
  try {
    console.log(`Polling Luma Dream Machine v1 status for job: ${jobId}`);
    
    const response = await fetch(`${lumaApiBase}/generations/${jobId}`, {
      method: 'GET',
      headers: {
        'Authorization': `Bearer ${lumaApiKey}`,
      },
    });
    
    const responseText = await response.text();
    console.log(`Luma status response: ${response.status} - ${responseText}`);
    
    if (!response.ok) {
      return {
        success: false,
        error: `Luma API error ${response.status}: ${responseText}`
      };
    }
    
    const data = JSON.parse(responseText);
    return { success: true, data };
    
  } catch (error) {
    console.error('Error polling Luma status:', error);
    return {
      success: false,
      error: `Failed to poll Luma status: ${error.message}`
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
    if (scene.luma_status === 'completed' || scene.luma_status === 'failed') {
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
          luma_status: 'failed',
          luma_error: lumaResult.error,
          updated_at: new Date().toISOString()
        })
        .eq('id', sceneId);

      return new Response(
        JSON.stringify({ 
          success: true,
          data: {
            sceneId: scene.id,
            status: 'error',
            lumaStatus: 'failed',
            lumaError: lumaResult.error,
            isTerminal: true
          },
          ok: true 
        }),
        { headers: responseHeaders }
      );
    }

    const lumaData = lumaResult.data;
    const userId = user.id;

    // Handle different Luma statuses
    if (lumaData.status === 'completed') {
      console.log('Scene completed, downloading video...');
      
      // Download and upload video
      const videoUrl = lumaData.assets?.video;
      if (!videoUrl) {
        // Update scene with error
        const { error: updateError } = await supabase
          .from('scenes')
          .update({
            luma_status: 'failed',
            status: 'error',
            luma_error: 'No video URL in completed Luma response',
            updated_at: new Date().toISOString()
          })
          .eq('id', sceneId)
          .eq('user_id', userId);

        return new Response(
          JSON.stringify({ 
            success: true,
            data: {
              sceneId: scene.id,
              status: 'error',
              lumaStatus: 'failed',
              lumaError: 'No video URL in completed response',
              isTerminal: true
            },
            ok: true 
          }),
          { headers: responseHeaders }
        );
      }

      const uploadResult = await uploadVideoToStorage(
        videoUrl,
        userId,
        scene.folder,
        sceneId,
        scene.version || 1
      );

      if (!uploadResult.success) {
        // Update scene with error
        const { error: updateError } = await supabase
          .from('scenes')
          .update({
            luma_status: 'failed',
            status: 'error',
            luma_error: uploadResult.error || 'Failed to upload video',
            updated_at: new Date().toISOString()
          })
          .eq('id', sceneId)
          .eq('user_id', userId);

        return new Response(
          JSON.stringify({ 
            success: true,
            data: {
              sceneId: scene.id,
              status: 'error',
              lumaStatus: 'failed',
              lumaError: uploadResult.error,
              isTerminal: true
            },
            ok: true 
          }),
          { headers: responseHeaders }
        );
      }

      console.log('Video uploaded successfully:', uploadResult.videoKey);

      // Create scene version record
      const { error: versionError } = await supabase
        .from('scene_versions')
        .insert({
          scene_id: sceneId,
          version: scene.version || 1,
          video_url: uploadResult.videoKey,
          render_meta: {
            luma_job_id: scene.luma_job_id,
            video_url: videoUrl,
            uploaded_at: new Date().toISOString()
          }
        });

      if (versionError) {
        console.error('Failed to create scene version:', versionError);
      }

      // Update scene status
      const { error: updateError } = await supabase
        .from('scenes')
        .update({
          luma_status: 'completed',
          status: 'ready',
          updated_at: new Date().toISOString()
        })
        .eq('id', sceneId)
        .eq('user_id', userId);

      if (updateError) {
        console.error('Failed to update scene status:', updateError);
      }

      return new Response(
        JSON.stringify({ 
          success: true,
          data: {
            sceneId: scene.id,
            status: 'ready',
            lumaStatus: 'completed',
            videoUrl: uploadResult.videoKey,
            isTerminal: true
          },
          ok: true 
        }),
        { headers: responseHeaders }
      );
    } else if (lumaData.status === 'failed') {
      console.log('Scene failed:', lumaData.error);
      
      // Update scene with error status
      const { error: updateError } = await supabase
        .from('scenes')
        .update({
          luma_status: 'failed',
          status: 'error',
          luma_error: lumaData.error || 'Scene generation failed',
          updated_at: new Date().toISOString()
        })
        .eq('id', sceneId)
        .eq('user_id', userId);

      if (updateError) {
        console.error('Failed to update scene error status:', updateError);
      }

      return new Response(
        JSON.stringify({ 
          success: true,
          data: {
            sceneId: scene.id,
            status: 'error',
            lumaStatus: 'failed',
            lumaError: lumaData.error,
            isTerminal: true
          },
          ok: true 
        }),
        { headers: responseHeaders }
      );
    } else if (lumaData.status === 'processing') {
      console.log('Scene still processing...');
      
      // Update scene status
      const { error: updateError } = await supabase
        .from('scenes')
        .update({
          luma_status: 'processing',
          status: 'processing',
          updated_at: new Date().toISOString()
        })
        .eq('id', sceneId)
        .eq('user_id', userId);

      if (updateError) {
        console.error('Failed to update scene processing status:', updateError);
      }

      return new Response(
        JSON.stringify({ 
          success: true,
          data: {
            sceneId: scene.id,
            status: 'processing',
            lumaStatus: 'processing',
            progress: lumaData.progress,
            isTerminal: false
          },
          ok: true 
        }),
        { headers: responseHeaders }
      );
    } else {
      console.log('Scene in queue or other state:', lumaData.status);
      
      // Update scene status
      const { error: updateError } = await supabase
        .from('scenes')
        .update({
          luma_status: lumaData.status,
          status: 'processing',
          updated_at: new Date().toISOString()
        })
        .eq('id', sceneId)
        .eq('user_id', userId);

      if (updateError) {
        console.error('Failed to update scene queue status:', updateError);
      }

      return new Response(
        JSON.stringify({ 
          success: true,
          data: {
            sceneId: scene.id,
            status: 'processing',
            lumaStatus: lumaData.status,
            progress: lumaData.progress,
            isTerminal: false
          },
          ok: true 
        }),
        { headers: responseHeaders }
      );
    }

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