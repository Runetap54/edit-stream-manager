-- Complete the scene_generations migration
-- Add NOT NULL constraint
ALTER TABLE public.scene_generations ALTER COLUMN shot_type_id SET NOT NULL;

-- Drop the old integer column if it exists
DO $$
BEGIN
    IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'scene_generations' AND column_name = 'shot_type') THEN
        ALTER TABLE public.scene_generations DROP COLUMN shot_type;
    END IF;
END $$;

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