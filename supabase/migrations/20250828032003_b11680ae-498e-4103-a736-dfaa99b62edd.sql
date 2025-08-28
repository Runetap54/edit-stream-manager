-- Update the scene_generations table to use shot_type_id instead of shot_type
-- First, add the new UUID column
ALTER TABLE public.scene_generations ADD COLUMN shot_type_id_new UUID;

-- Update existing records to map to the first shot type for the user
UPDATE public.scene_generations 
SET shot_type_id_new = (
  SELECT st.id 
  FROM public.shot_types st 
  INNER JOIN public.scenes s ON s.id = scene_generations.scene_id
  WHERE st.owner_id = s.user_id 
  ORDER BY st.sort_order 
  LIMIT 1
)
WHERE shot_type IS NOT NULL;

-- Drop the old integer column
ALTER TABLE public.scene_generations DROP COLUMN shot_type;

-- Rename the new column
ALTER TABLE public.scene_generations RENAME COLUMN shot_type_id_new TO shot_type_id;

-- Add NOT NULL constraint
ALTER TABLE public.scene_generations ALTER COLUMN shot_type_id SET NOT NULL;

-- Add foreign key constraint
ALTER TABLE public.scene_generations ADD CONSTRAINT scene_generations_shot_type_id_fkey 
FOREIGN KEY (shot_type_id) REFERENCES public.shot_types(id);

-- Add index for better performance
CREATE INDEX idx_scene_generations_shot_type_id ON public.scene_generations(shot_type_id);