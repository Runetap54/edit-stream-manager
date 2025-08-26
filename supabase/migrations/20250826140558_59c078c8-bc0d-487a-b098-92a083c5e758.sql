-- Add owner_id to photos table if not exists
ALTER TABLE public.photos 
ADD COLUMN IF NOT EXISTS owner_id uuid REFERENCES auth.users(id) ON DELETE CASCADE;

-- Update photos table to have owner_id not null (set it for existing records)
UPDATE public.photos 
SET owner_id = (
  SELECT owner_id 
  FROM public.projects 
  WHERE projects.id = photos.project_id
) 
WHERE owner_id IS NULL;

-- Make owner_id not null after setting values
ALTER TABLE public.photos 
ALTER COLUMN owner_id SET NOT NULL;

-- Create RLS policies for photos
DROP POLICY IF EXISTS "photos select owner" ON public.photos;
DROP POLICY IF EXISTS "photos_select_owner" ON public.photos;
DROP POLICY IF EXISTS "photos_insert_owner" ON public.photos;

CREATE POLICY "photos_select_owner" 
ON public.photos FOR SELECT 
USING (owner_id = auth.uid());

CREATE POLICY "photos_insert_owner" 
ON public.photos FOR INSERT 
WITH CHECK (owner_id = auth.uid());

-- Enable realtime for photos table
ALTER TABLE public.photos REPLICA IDENTITY FULL;
ALTER publication supabase_realtime ADD TABLE public.photos;