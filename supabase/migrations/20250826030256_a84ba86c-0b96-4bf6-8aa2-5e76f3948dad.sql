-- Fix the search path issue in the is_admin function
CREATE OR REPLACE FUNCTION public.is_admin(user_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 
    FROM public.profiles 
    WHERE profiles.id = user_id 
      AND profiles.role = 'admin' 
      AND profiles.status = 'approved'
  );
$$;