-- Create error_events table for server logging
CREATE TABLE IF NOT EXISTS public.error_events (
  id BIGSERIAL PRIMARY KEY,
  created_at TIMESTAMPTZ DEFAULT now(),
  user_id UUID,
  route TEXT,
  method TEXT,
  status INTEGER,
  code TEXT,
  message TEXT,
  correlation_id TEXT,
  safe_context JSONB
);

-- Enable RLS on error_events
ALTER TABLE public.error_events ENABLE ROW LEVEL SECURITY;

-- Policy: Only admins can view error events
CREATE POLICY "error_events_admin_only" ON public.error_events
  FOR SELECT 
  USING (is_admin(auth.uid()));

-- Update projects table to ensure it has proper structure
ALTER TABLE public.projects ADD COLUMN IF NOT EXISTS owner_id UUID NOT NULL DEFAULT auth.uid();
ALTER TABLE public.projects ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ DEFAULT now();
ALTER TABLE public.projects ADD CONSTRAINT unique_owner_name UNIQUE(owner_id, name);

-- Enable RLS on projects (if not already enabled)
ALTER TABLE public.projects ENABLE ROW LEVEL SECURITY;

-- Drop existing policies if they exist and recreate
DROP POLICY IF EXISTS "projects_select_owner" ON public.projects;
DROP POLICY IF EXISTS "projects_insert_owner" ON public.projects;
DROP POLICY IF EXISTS "projects_update_owner" ON public.projects;

-- Create comprehensive project policies
CREATE POLICY "projects_select_owner" ON public.projects
  FOR SELECT 
  USING (owner_id = auth.uid());

CREATE POLICY "projects_insert_owner" ON public.projects
  FOR INSERT 
  WITH CHECK (owner_id = auth.uid());

CREATE POLICY "projects_update_owner" ON public.projects
  FOR UPDATE 
  USING (owner_id = auth.uid());

-- Create trigger for projects updated_at
CREATE OR REPLACE FUNCTION public.update_projects_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Create trigger
DROP TRIGGER IF EXISTS update_projects_updated_at ON public.projects;
CREATE TRIGGER update_projects_updated_at
  BEFORE UPDATE ON public.projects
  FOR EACH ROW
  EXECUTE FUNCTION public.update_projects_updated_at();