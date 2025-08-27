-- Fix shot_type column type mismatch in scenes table
-- Change from integer to uuid to properly reference shot_types.id
ALTER TABLE public.scenes 
ALTER COLUMN shot_type TYPE uuid USING shot_type::text::uuid;

-- Add foreign key constraint to ensure data integrity
ALTER TABLE public.scenes 
ADD CONSTRAINT scenes_shot_type_fkey 
FOREIGN KEY (shot_type) REFERENCES public.shot_types(id);