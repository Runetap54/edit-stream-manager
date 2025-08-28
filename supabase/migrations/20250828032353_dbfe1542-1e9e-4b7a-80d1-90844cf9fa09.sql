-- Fix scene_generations table to use shot_type_id instead of shot_type
-- First, check if shot_type_id column exists
DO $$
BEGIN
    -- Add shot_type_id column if it doesn't exist
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'scene_generations' AND column_name = 'shot_type_id') THEN
        ALTER TABLE public.scene_generations ADD COLUMN shot_type_id UUID;
    END IF;
END $$;

-- Update existing records to map to the first shot type for the user
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

-- Drop the old integer column if it exists
DO $$
BEGIN
    IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'scene_generations' AND column_name = 'shot_type') THEN
        ALTER TABLE public.scene_generations DROP COLUMN shot_type;
    END IF;
END $$;

-- Add NOT NULL constraint
ALTER TABLE public.scene_generations ALTER COLUMN shot_type_id SET NOT NULL;

-- Add foreign key constraint if it doesn't exist
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM information_schema.table_constraints WHERE constraint_name = 'scene_generations_shot_type_id_fkey') THEN
        ALTER TABLE public.scene_generations ADD CONSTRAINT scene_generations_shot_type_id_fkey 
        FOREIGN KEY (shot_type_id) REFERENCES public.shot_types(id);
    END IF;
END $$;

-- Add index if it doesn't exist
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_indexes WHERE indexname = 'idx_scene_generations_shot_type_id') THEN
        CREATE INDEX idx_scene_generations_shot_type_id ON public.scene_generations(shot_type_id);
    END IF;
END $$;