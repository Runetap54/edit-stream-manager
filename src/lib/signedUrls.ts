import { supabase } from "@/integrations/supabase/client";

// Convert CDN URL back to storage path
export function extractStoragePath(cdnUrl: string): string {
  try {
    const url = new URL(cdnUrl);
    const pathParts = url.pathname.split('/');
    const objectIndex = pathParts.findIndex(part => part === 'object');
    if (objectIndex === -1) return '';
    
    // Extract bucket and path
    const bucket = pathParts[objectIndex + 1];
    const storagePath = pathParts.slice(objectIndex + 2).join('/');
    return storagePath;
  } catch (error) {
    console.error('Error extracting storage path from CDN URL:', error);
    return '';
  }
}

// Generate signed URL with 1 week expiry
export async function generateSignedUrl(storagePath: string): Promise<string | null> {
  try {
    const { data, error } = await supabase.storage
      .from('media')
      .createSignedUrl(storagePath, 604800); // 1 week in seconds

    if (error) {
      console.error('Error generating signed URL:', error);
      return null;
    }

    return data.signedUrl;
  } catch (error) {
    console.error('Error generating signed URL:', error);
    return null;
  }
}

// Check if signed URL is expired
export function isSignedUrlExpired(expiresAt: string | null): boolean {
  if (!expiresAt) return true;
  return new Date(expiresAt) <= new Date();
}

// Refresh expired signed URLs for a scene
export async function refreshSceneSignedUrls(sceneId: string): Promise<boolean> {
  try {
    // Get current scene data
    const { data: scene, error: fetchError } = await supabase
      .from('scenes')
      .select('start_key, end_key, signed_url_expires_at')
      .eq('id', sceneId)
      .single();

    if (fetchError || !scene) {
      console.error('Error fetching scene:', fetchError);
      return false;
    }

    // Check if refresh is needed
    if (!isSignedUrlExpired(scene.signed_url_expires_at)) {
      return true; // URLs are still valid
    }

    // Generate new signed URLs
    const startSignedUrl = await generateSignedUrl(scene.start_key);
    const endSignedUrl = scene.end_key ? await generateSignedUrl(scene.end_key) : null;

    if (!startSignedUrl) {
      console.error('Failed to generate start frame signed URL');
      return false;
    }

    // Update scene with new signed URLs
    const expiresAt = new Date();
    expiresAt.setDate(expiresAt.getDate() + 7); // 1 week from now

    const { error: updateError } = await supabase
      .from('scenes')
      .update({
        start_frame_signed_url: startSignedUrl,
        end_frame_signed_url: endSignedUrl,
        signed_url_expires_at: expiresAt.toISOString()
      })
      .eq('id', sceneId);

    if (updateError) {
      console.error('Error updating signed URLs:', updateError);
      return false;
    }

    return true;
  } catch (error) {
    console.error('Error refreshing signed URLs:', error);
    return false;
  }
}