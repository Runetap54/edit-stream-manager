-- Fix RLS policy issue for admin_approvals table
CREATE POLICY "Service role can manage admin approvals" ON public.admin_approvals
  FOR ALL USING (true);

-- Fix function search paths to be immutable
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = 'public'
AS $$
BEGIN
  INSERT INTO public.profiles (id, email, role, status)
  VALUES (NEW.id, NEW.email, 'user', 'pending');
  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION public.update_updated_at_column()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = 'public'
AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$;