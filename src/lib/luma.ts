import { supabase } from "@/integrations/supabase/client";

export interface LumaCreateRequest {
  prompt: string;
  model?: string;
  aspect_ratio?: string;
  duration?: number;
  resolution?: string;
  frame0Url?: string;
  frame1Url?: string;
}

export interface LumaCreateResponse {
  id: string;
  state?: string;
  created_at?: string;
  video?: {
    url?: string;
  };
  failure_reason?: string;
}

export interface LumaStatusResponse {
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

export class LumaError extends Error {
  constructor(
    message: string,
    public status: number,
    public details?: string
  ) {
    super(message);
    this.name = "LumaError";
  }
}

/**
 * Create a new Luma Dream Machine generation
 */
export async function lumaCreate(request: LumaCreateRequest): Promise<LumaCreateResponse> {
  const { data, error } = await supabase.functions.invoke('luma-create', {
    body: request
  });

  if (error) {
    throw new LumaError(error.message, 500, error.details);
  }

  if (data.error) {
    throw new LumaError(data.error, data.status || 500, data.details);
  }

  return data;
}

/**
 * Check the status of a Luma generation
 */
export async function lumaStatus(id: string): Promise<LumaStatusResponse> {
  // This would typically be called server-side, but for demo we'll simulate
  // In production, you'd want this as another edge function
  throw new Error("lumaStatus should be implemented as server-side polling");
}

/**
 * Poll a Luma generation until completion
 */
export async function pollLumaGeneration(
  id: string,
  onProgress?: (status: LumaStatusResponse) => void,
  maxAttempts = 100,
  intervalMs = 3000
): Promise<LumaStatusResponse> {
  let attempts = 0;
  
  while (attempts < maxAttempts) {
    try {
      const status = await lumaStatus(id);
      
      if (onProgress) {
        onProgress(status);
      }
      
      if (status.state === "completed" || status.state === "failed") {
        return status;
      }
      
      attempts++;
      await new Promise(resolve => setTimeout(resolve, intervalMs));
      
    } catch (error) {
      if (attempts === maxAttempts - 1) {
        throw error;
      }
      attempts++;
      await new Promise(resolve => setTimeout(resolve, intervalMs));
    }
  }
  
  throw new Error(`Polling timeout after ${maxAttempts} attempts`);
}

/**
 * Test if a URL is accessible via HEAD request
 */
export async function testImageUrl(url: string): Promise<{
  ok: boolean;
  status: number;
  contentType?: string;
  contentLength?: string;
  error?: string;
}> {
  try {
    const response = await fetch(url, { method: "HEAD" });
    
    return {
      ok: response.ok,
      status: response.status,
      contentType: response.headers.get("content-type") || undefined,
      contentLength: response.headers.get("content-length") || undefined
    };
  } catch (error) {
    return {
      ok: false,
      status: 0,
      error: error instanceof Error ? error.message : "Network error"
    };
  }
}

export const DEFAULTS = {
  model: "ray-flash-2" as const,
  aspect_ratio: "16:9" as const,
  resolution: "1080p" as const,
};