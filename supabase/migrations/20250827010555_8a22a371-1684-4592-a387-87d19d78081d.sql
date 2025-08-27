-- Create storage policies for the media bucket to handle the new Photos/ path structure
-- Users can only access photos they own based on the photos table

-- Policy to allow users to view their own photos
CREATE POLICY "Users can view their own photos" 
ON storage.objects 
FOR SELECT 
USING (
  bucket_id = 'media' 
  AND name LIKE 'Photos/%' 
  AND EXISTS (
    SELECT 1 FROM public.photos 
    WHERE photos.storage_key = objects.name 
    AND photos.owner_id = auth.uid()
  )
);

-- Policy to allow users to upload photos
CREATE POLICY "Users can upload photos" 
ON storage.objects 
FOR INSERT 
WITH CHECK (
  bucket_id = 'media' 
  AND name LIKE 'Photos/%'
  AND auth.uid() IS NOT NULL
);

-- Policy to allow users to update their own photos
CREATE POLICY "Users can update their own photos" 
ON storage.objects 
FOR UPDATE 
USING (
  bucket_id = 'media' 
  AND name LIKE 'Photos/%' 
  AND EXISTS (
    SELECT 1 FROM public.photos 
    WHERE photos.storage_key = objects.name 
    AND photos.owner_id = auth.uid()
  )
);

-- Policy to allow users to delete their own photos
CREATE POLICY "Users can delete their own photos" 
ON storage.objects 
FOR DELETE 
USING (
  bucket_id = 'media' 
  AND name LIKE 'Photos/%' 
  AND EXISTS (
    SELECT 1 FROM public.photos 
    WHERE photos.storage_key = objects.name 
    AND photos.owner_id = auth.uid()
  )
);