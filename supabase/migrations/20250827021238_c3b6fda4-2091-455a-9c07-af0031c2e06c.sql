-- Add signed URL fields to scenes table for better URL management
ALTER TABLE public.scenes 
ADD COLUMN start_frame_signed_url TEXT,
ADD COLUMN end_frame_signed_url TEXT,
ADD COLUMN signed_url_expires_at TIMESTAMP WITH TIME ZONE;

-- Create index for efficient signed URL expiry queries
CREATE INDEX idx_scenes_signed_url_expires ON public.scenes(signed_url_expires_at);

-- Add function to check if signed URLs are expired
CREATE OR REPLACE FUNCTION public.are_signed_urls_expired(expires_at TIMESTAMP WITH TIME ZONE)
RETURNS BOOLEAN
LANGUAGE SQL
STABLE
AS $$
  SELECT expires_at IS NULL OR expires_at < NOW();
$$;