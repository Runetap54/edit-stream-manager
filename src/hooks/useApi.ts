import { useState, useCallback } from 'react';
import { toast } from 'sonner';
import { supabase } from '@/integrations/supabase/client';
import { logClientError } from '@/lib/logger';

export interface ApiError {
  code: string;
  message: string;
  detail?: any;
  correlationId: string;
  upstream?: {
    endpoint: string;
    status: number;
    bodySnippet?: string;
  };
}

interface UseApiOptions {
  showToast?: boolean;
  successMessage?: string;
}

export function useApi<T = any>(options: UseApiOptions = {}) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<ApiError | null>(null);

  const execute = useCallback(async (
    apiCall: () => Promise<T>
  ): Promise<T | null> => {
    setLoading(true);
    setError(null);

    try {
      const result = await apiCall();
      
      if (options.successMessage && options.showToast !== false) {
        toast.success(options.successMessage);
      }
      
      return result;
    } catch (err: any) {
      const apiError = parseApiError(err);
      setError(apiError);
      
      // Log client error
      const { data: { user } } = await supabase.auth.getUser();
      await logClientError(apiError, {
        route: window.location.pathname,
        action: 'api_call',
        userId: user?.id,
      });

      if (options.showToast !== false) {
        showErrorToast(apiError);
      }
      
      return null;
    } finally {
      setLoading(false);
    }
  }, [options]);

  return { execute, loading, error };
}

function parseApiError(error: any): ApiError {
  // Handle Supabase function errors
  if (error?.error) {
    return {
      code: error.error.code || 'UNKNOWN_ERROR',
      message: error.error.message || 'An unexpected error occurred',
      detail: error.error.detail,
      correlationId: error.error.correlationId || crypto.randomUUID(),
      upstream: error.error.upstream,
    };
  }

  // Handle network/fetch errors
  if (error?.message) {
    return {
      code: 'NETWORK_ERROR',
      message: error.message,
      correlationId: crypto.randomUUID(),
    };
  }

  // Fallback
  return {
    code: 'UNKNOWN_ERROR',
    message: 'An unexpected error occurred',
    correlationId: crypto.randomUUID(),
  };
}

function showErrorToast(error: ApiError) {
  const friendlyMessage = getFriendlyErrorMessage(error);
  
  toast.error(friendlyMessage, {
    description: error.correlationId,
    action: error.code !== 'NETWORK_ERROR' ? {
      label: 'Copy Details',
      onClick: () => {
        navigator.clipboard.writeText(
          `Error Code: ${error.code}\nCorrelation ID: ${error.correlationId}\nMessage: ${error.message}`
        );
        toast.success('Error details copied to clipboard');
      },
    } : undefined,
  });
}

function getFriendlyErrorMessage(error: ApiError): string {
  switch (error.code) {
    case 'N8N_RENDER_FAILED':
      return 'Render service is unreachable. Please check webhook URL and credentials.';
    case 'VALIDATION_ERROR':
      return error.message || 'Please check your input and try again.';
    case 'RLS_DENIED':
    case 'FORBIDDEN_ERROR':
      return 'You are not allowed to perform this action.';
    case 'AUTH_ERROR':
      return 'Please sign in to continue.';
    case 'RATE_LIMITED':
      return error.message || 'Too many requests. Please wait and try again.';
    case 'EXPORT_TOO_LARGE':
      return `Export too large (${error.detail?.totalMb}MB). Please reduce the number of files.`;
    case 'UPSTREAM_ERROR':
      return 'External service is temporarily unavailable. Please try again later.';
    case 'NETWORK_ERROR':
      return 'Network connection error. Please check your internet connection.';
    default:
      return error.message || 'Something went wrong. Please try again.';
  }
}