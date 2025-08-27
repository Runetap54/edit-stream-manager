import { useState, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';

export interface ShotType {
  id: string;
  name: string;
  prompt_template: string;
  hotkey: string;
  sort_order: number;
  created_at: string;
  updated_at: string;
}

export function useShotTypes() {
  const [shotTypes, setShotTypes] = useState<ShotType[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchShotTypes = async () => {
    try {
      setLoading(true);
      setError(null);

      const { data: { session } } = await supabase.auth.getSession();
      if (!session) {
        throw new Error('Not authenticated');
      }

      const response = await supabase.functions.invoke('shot-types', {
        method: 'GET'
      });

      if (response.error) {
        throw response.error;
      }

      if (!response.data.ok) {
        throw new Error(response.data.error?.message || 'Failed to fetch shot types');
      }

      setShotTypes(response.data.data || []);
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Failed to fetch shot types';
      setError(errorMessage);
      toast.error(errorMessage);
    } finally {
      setLoading(false);
    }
  };

  const createShotType = async (shotType: {
    name: string;
    prompt_template: string;
    hotkey: string;
    sort_order?: number;
  }) => {
    try {
      const response = await supabase.functions.invoke('shot-types', {
        method: 'POST',
        body: shotType
      });

      if (response.error) {
        throw response.error;
      }

      if (!response.data.ok) {
        throw new Error(response.data.error?.message || 'Failed to create shot type');
      }

      const newShotType = response.data.data;
      setShotTypes(prev => [...prev, newShotType].sort((a, b) => a.sort_order - b.sort_order));
      toast.success('Shot type created successfully');
      return newShotType;
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Failed to create shot type';
      toast.error(errorMessage);
      throw err;
    }
  };

  const updateShotType = async (id: string, updates: {
    name?: string;
    prompt_template?: string;
    hotkey?: string;
    sort_order?: number;
  }) => {
    try {
      const response = await supabase.functions.invoke(`shot-types/${id}`, {
        method: 'PUT',
        body: updates
      });

      if (response.error) {
        throw response.error;
      }

      if (!response.data.ok) {
        throw new Error(response.data.error?.message || 'Failed to update shot type');
      }

      const updatedShotType = response.data.data;
      setShotTypes(prev => prev.map(st => 
        st.id === id ? updatedShotType : st
      ).sort((a, b) => a.sort_order - b.sort_order));
      toast.success('Shot type updated successfully');
      return updatedShotType;
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Failed to update shot type';
      toast.error(errorMessage);
      throw err;
    }
  };

  const deleteShotType = async (id: string) => {
    try {
      const response = await supabase.functions.invoke(`shot-types/${id}`, {
        method: 'DELETE'
      });

      if (response.error) {
        throw response.error;
      }

      if (!response.data.ok) {
        throw new Error(response.data.error?.message || 'Failed to delete shot type');
      }

      setShotTypes(prev => prev.filter(st => st.id !== id));
      toast.success('Shot type deleted successfully');
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Failed to delete shot type';
      toast.error(errorMessage);
      throw err;
    }
  };

  useEffect(() => {
    fetchShotTypes();
  }, []);

  return {
    shotTypes,
    loading,
    error,
    refetch: fetchShotTypes,
    createShotType,
    updateShotType,
    deleteShotType
  };
}