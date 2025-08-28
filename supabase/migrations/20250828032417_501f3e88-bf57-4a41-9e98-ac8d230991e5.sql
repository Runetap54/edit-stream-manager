-- Clean up scene_generations table
-- First delete any orphaned records that don't have valid scenes
DELETE FROM public.scene_generations 
WHERE scene_id NOT IN (SELECT id FROM public.scenes);

-- Also delete records where we can't map to a valid shot type
DELETE FROM public.scene_generations 
WHERE scene_id NOT IN (
  SELECT s.id 
  FROM public.scenes s 
  INNER JOIN public.shot_types st ON st.owner_id = s.user_id
);

-- Now add the shot_type_id column if it doesn't exist
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'scene_generations' AND column_name = 'shot_type_id') THEN
        ALTER TABLE public.scene_generations ADD COLUMN shot_type_id UUID;
    END IF;
END $$;

-- Update all remaining records to use a valid shot_type_id
UPDATE public.scene_generations 
SET shot_type_id = (
  SELECT st.id 
  FROM public.shot_types st 
  INNER JOIN public.scenes s ON s.id = scene_generations.scene_id
  WHERE st.owner_id = s.user_id 
  ORDER BY st.sort_order 
  LIMIT 1
)
WHERE shot_type_id IS NULL;