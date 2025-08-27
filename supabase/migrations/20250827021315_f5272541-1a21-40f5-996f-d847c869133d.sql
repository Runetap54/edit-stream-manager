-- Fix the function search path security issue
CREATE OR REPLACE FUNCTION public.are_signed_urls_expired(expires_at TIMESTAMP WITH TIME ZONE)
RETURNS BOOLEAN
LANGUAGE SQL
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT expires_at IS NULL OR expires_at < NOW();
$$;