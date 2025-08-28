-- First, drop the existing shot_type column  
ALTER TABLE public.scenes DROP COLUMN shot_type;

-- Add a new shot_type_id column that references the shot_types table properly
ALTER TABLE public.scenes ADD COLUMN shot_type_id UUID REFERENCES public.shot_types(id);

-- Update the scenes table to make shot_type_id NOT NULL
ALTER TABLE public.scenes ALTER COLUMN shot_type_id SET NOT NULL;

-- Add an index for better performance
CREATE INDEX idx_scenes_shot_type_id ON public.scenes(shot_type_id);