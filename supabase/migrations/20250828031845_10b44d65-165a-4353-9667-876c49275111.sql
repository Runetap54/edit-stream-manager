-- Create a temporary column for the new UUID reference
ALTER TABLE public.scenes ADD COLUMN shot_type_id_new UUID;

-- Update existing scenes to map integer shot_type to UUID shot_type_id
-- We'll need to get the first available shot type for each user since we don't have a mapping
UPDATE public.scenes 
SET shot_type_id_new = (
  SELECT st.id 
  FROM public.shot_types st 
  WHERE st.owner_id = scenes.user_id 
  ORDER BY st.sort_order 
  LIMIT 1
)
WHERE shot_type IS NOT NULL;

-- Drop the old integer column
ALTER TABLE public.scenes DROP COLUMN shot_type;

-- Rename the new column to shot_type_id
ALTER TABLE public.scenes RENAME COLUMN shot_type_id_new TO shot_type_id;

-- Add NOT NULL constraint
ALTER TABLE public.scenes ALTER COLUMN shot_type_id SET NOT NULL;

-- Add foreign key constraint
ALTER TABLE public.scenes ADD CONSTRAINT scenes_shot_type_id_fkey 
FOREIGN KEY (shot_type_id) REFERENCES public.shot_types(id);

-- Add index for better performance
CREATE INDEX idx_scenes_shot_type_id ON public.scenes(shot_type_id);