import { useState, useEffect, useRef } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';

interface SceneStatus {
  sceneId: string;
  status: string;
  lumaStatus: string;
  lumaError?: string;
  progress?: number;
  isTerminal: boolean;
}

export function useScenePolling(sceneId: string | null, enabled: boolean = true) {
  const [status, setStatus] = useState<SceneStatus | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const intervalRef = useRef<NodeJS.Timeout | null>(null);
  const pollIntervalMs = parseInt(process.env.LUMA_POLL_INTERVAL_MS || '4000');

  const pollStatus = async (currentSceneId: string) => {
    try {
      setError(null);
      
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) {
        throw new Error('Not authenticated');
      }

      const response = await supabase.functions.invoke(`luma-scene-status/${currentSceneId}`, {
        method: 'GET'
      });

      if (response.error) {
        throw response.error;
      }

      if (!response.data.ok) {
        throw new Error(response.data.error?.message || 'Failed to fetch scene status');
      }

      const statusData = response.data.data;
      setStatus(statusData);

      // Show completion toast
      if (statusData.isTerminal) {
        if (statusData.lumaStatus === 'completed') {
          toast.success('Scene generated successfully!', {
            description: `Scene ${currentSceneId.slice(0, 8)}... is ready to view`
          });
        } else if (statusData.lumaStatus === 'error') {
          toast.error('Scene generation failed', {
            description: statusData.lumaError || 'Unknown error occurred'
          });
        }
        return true; // Stop polling
      }

      return false; // Continue polling
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Failed to poll scene status';
      setError(errorMessage);
      console.error('Scene polling error:', err);
      return true; // Stop polling on error
    }
  };

  const startPolling = (currentSceneId: string) => {
    // Clear any existing interval
    if (intervalRef.current) {
      clearInterval(intervalRef.current);
    }

    // Initial poll
    setLoading(true);
    pollStatus(currentSceneId).then(shouldStop => {
      setLoading(false);
      if (shouldStop) return;

      // Start interval polling
      intervalRef.current = setInterval(async () => {
        const shouldStop = await pollStatus(currentSceneId);
        if (shouldStop && intervalRef.current) {
          clearInterval(intervalRef.current);
          intervalRef.current = null;
        }
      }, pollIntervalMs);
    });
  };

  const stopPolling = () => {
    if (intervalRef.current) {
      clearInterval(intervalRef.current);
      intervalRef.current = null;
    }
    setLoading(false);
  };

  const resetStatus = () => {
    setStatus(null);
    setError(null);
    setLoading(false);
  };

  useEffect(() => {
    if (!enabled || !sceneId) {
      stopPolling();
      resetStatus();
      return;
    }

    // Check if we need to poll for this scene
    if (status?.sceneId !== sceneId || (!status?.isTerminal && !intervalRef.current)) {
      startPolling(sceneId);
    }

    return () => {
      stopPolling();
    };
  }, [sceneId, enabled]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      stopPolling();
    };
  }, []);

  return {
    status,
    loading,
    error,
    isPolling: intervalRef.current !== null,
    startPolling: (id: string) => startPolling(id),
    stopPolling,
    resetStatus
  };
}