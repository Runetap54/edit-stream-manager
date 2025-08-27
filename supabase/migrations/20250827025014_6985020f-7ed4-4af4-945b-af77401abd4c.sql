-- Create scene_generations table for the new workflow
CREATE TABLE public.scene_generations (
  generation_id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  scene_id UUID NOT NULL,
  start_frame_url TEXT NOT NULL,
  end_frame_url TEXT,
  shot_type INTEGER NOT NULL,
  status TEXT NOT NULL DEFAULT 'queued',
  progress_pct INTEGER,
  video_url TEXT,
  error_code TEXT,
  error_message TEXT,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Enable Row Level Security
ALTER TABLE public.scene_generations ENABLE ROW LEVEL SECURITY;

-- Create policies for scene_generations
CREATE POLICY "Users can view their scene generations" 
ON public.scene_generations 
FOR SELECT 
USING (EXISTS (
  SELECT 1 FROM scenes 
  WHERE scenes.id = scene_generations.scene_id 
  AND scenes.user_id = auth.uid()
  AND EXISTS (
    SELECT 1 FROM profiles 
    WHERE profiles.id = auth.uid() 
    AND profiles.status = 'approved'
  )
));

-- Add trigger for updated_at
CREATE TRIGGER update_scene_generations_updated_at
BEFORE UPDATE ON public.scene_generations
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();

-- Enable realtime for scene_generations
ALTER TABLE public.scene_generations REPLICA IDENTITY FULL;
ALTER PUBLICATION supabase_realtime ADD TABLE public.scene_generations;