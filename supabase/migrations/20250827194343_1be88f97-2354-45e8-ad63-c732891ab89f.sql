-- Add ordinal column to scenes table for sequential naming
ALTER TABLE public.scenes ADD COLUMN IF NOT EXISTS ordinal int;

-- Add project_id column if it doesn't exist (needed for ordinal calculation)
ALTER TABLE public.scenes ADD COLUMN IF NOT EXISTS project_id uuid;

-- Create index for efficient ordinal lookups
CREATE INDEX IF NOT EXISTS idx_scenes_project_ordinal ON public.scenes(project_id, ordinal);

-- Function to get next ordinal for a project
CREATE OR REPLACE FUNCTION public.next_scene_ordinal(p_project_id uuid)
RETURNS int 
LANGUAGE sql 
SECURITY DEFINER 
SET search_path = public 
AS $$
  SELECT COALESCE(MAX(ordinal), 0) + 1 FROM public.scenes WHERE project_id = p_project_id;
$$;

-- Add version column to scenes table to track regenerations
ALTER TABLE public.scenes ADD COLUMN IF NOT EXISTS version int DEFAULT 1;

-- Update scenes table to have proper defaults and constraints
ALTER TABLE public.scenes ALTER COLUMN version SET DEFAULT 1;
ALTER TABLE public.scenes ALTER COLUMN version SET NOT NULL;