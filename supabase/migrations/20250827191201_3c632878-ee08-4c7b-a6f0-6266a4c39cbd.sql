-- Add Luma integration columns to scenes table
ALTER TABLE public.scenes 
ADD COLUMN IF NOT EXISTS luma_job_id text,
ADD COLUMN IF NOT EXISTS luma_status text DEFAULT 'pending',
ADD COLUMN IF NOT EXISTS luma_error text;

-- Create shot_types table for user-defined shot types
CREATE TABLE IF NOT EXISTS public.shot_types (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  name text NOT NULL,
  prompt_template text NOT NULL,
  hotkey text NOT NULL,
  sort_order integer DEFAULT 0,
  created_at timestamp with time zone DEFAULT now(),
  updated_at timestamp with time zone DEFAULT now(),
  UNIQUE(owner_id, name),
  UNIQUE(owner_id, hotkey)
);

-- Enable RLS on shot_types table
ALTER TABLE public.shot_types ENABLE ROW LEVEL SECURITY;

-- RLS policies for shot_types
CREATE POLICY "Users can view their own shot types"
ON public.shot_types
FOR SELECT
USING (auth.uid() = owner_id);

CREATE POLICY "Users can insert their own shot types"
ON public.shot_types
FOR INSERT
WITH CHECK (auth.uid() = owner_id);

CREATE POLICY "Users can update their own shot types"
ON public.shot_types
FOR UPDATE
USING (auth.uid() = owner_id);

CREATE POLICY "Users can delete their own shot types"
ON public.shot_types
FOR DELETE
USING (auth.uid() = owner_id);

-- Add trigger for updated_at on shot_types
CREATE TRIGGER update_shot_types_updated_at
  BEFORE UPDATE ON public.shot_types
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();

-- Insert default shot types for existing users
INSERT INTO public.shot_types (owner_id, name, prompt_template, hotkey, sort_order)
SELECT 
  id as owner_id,
  'Wide Shot' as name,
  'Create a cinematic wide shot that establishes the scene and shows the full environment. Use sweeping camera movements and capture the grandeur of the setting.' as prompt_template,
  '1' as hotkey,
  1 as sort_order
FROM auth.users
ON CONFLICT (owner_id, name) DO NOTHING;

INSERT INTO public.shot_types (owner_id, name, prompt_template, hotkey, sort_order)
SELECT 
  id as owner_id,
  'Medium Shot' as name,
  'Create a balanced medium shot that shows subjects from the waist up. Focus on natural interactions and meaningful gestures.' as prompt_template,
  '2' as hotkey,
  2 as sort_order
FROM auth.users
ON CONFLICT (owner_id, name) DO NOTHING;

INSERT INTO public.shot_types (owner_id, name, prompt_template, hotkey, sort_order)
SELECT 
  id as owner_id,
  'Close-up' as name,
  'Create an intimate close-up that captures fine details and emotions. Focus on facial expressions, textures, and subtle movements.' as prompt_template,
  '3' as hotkey,
  3 as sort_order
FROM auth.users
ON CONFLICT (owner_id, name) DO NOTHING;

INSERT INTO public.shot_types (owner_id, name, prompt_template, hotkey, sort_order)
SELECT 
  id as owner_id,
  'Dolly Zoom' as name,
  'Create a dramatic dolly zoom effect where the camera moves while adjusting focal length. Create a sense of unease or revelation.' as prompt_template,
  '4' as hotkey,
  4 as sort_order
FROM auth.users
ON CONFLICT (owner_id, name) DO NOTHING;

INSERT INTO public.shot_types (owner_id, name, prompt_template, hotkey, sort_order)
SELECT 
  id as owner_id,
  'Tracking Shot' as name,
  'Create a smooth tracking shot that follows the subject through the scene. Maintain consistent framing while revealing the environment.' as prompt_template,
  '5' as hotkey,
  5 as sort_order
FROM auth.users
ON CONFLICT (owner_id, name) DO NOTHING;

INSERT INTO public.shot_types (owner_id, name, prompt_template, hotkey, sort_order)
SELECT 
  id as owner_id,
  'Aerial View' as name,
  'Create a breathtaking aerial shot that provides a bird''s eye perspective. Show patterns, landscapes, and scale from above.' as prompt_template,
  '6' as hotkey,
  6 as sort_order
FROM auth.users
ON CONFLICT (owner_id, name) DO NOTHING;