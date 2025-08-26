import { supabase } from '@/integrations/supabase/client';
import { createClient } from '@supabase/supabase-js';

const supabaseUrl = "https://fmizfozbyrohydcutkgg.supabase.co";
const supabaseServiceKey = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImZtaXpmb3pieXJvaHlkY3V0a2dnIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc1NjE3NTY3NywiZXhwIjoyMDcxNzUxNjc3fQ.7pM_A7WcSdnuPXuwWnNaagMPZjfCJ5R6vxPdDzb1gQE";

// Service role client for server-side logging
const serviceClient = createClient(supabaseUrl, supabaseServiceKey);

export interface LogErrorParams {
  route: string;
  method: string;
  status: number;
  code: string;
  message: string;
  correlationId: string;
  userId?: string;
  safeContext?: Record<string, any>;
}

export async function logError(params: LogErrorParams): Promise<void> {
  const {
    route,
    method,
    status,
    code,
    message,
    correlationId,
    userId,
    safeContext
  } = params;

  try {
    // Log to database using service role
    await serviceClient
      .from('error_events')
      .insert({
        route,
        method,
        status,
        code,
        message,
        correlation_id: correlationId,
        user_id: userId,
        safe_context: safeContext || {}
      });

    // Also log to console for immediate visibility
    console.error(`[${correlationId}] ${method} ${route} - ${status} ${code}: ${message}`, {
      userId,
      safeContext
    });
  } catch (logError) {
    // Fallback to console if database logging fails
    console.error(`Failed to log error to database:`, logError);
    console.error(`Original error [${correlationId}]:`, params);
  }
}

export async function logClientError(
  error: any,
  context: { route?: string; action?: string; userId?: string } = {}
): Promise<void> {
  try {
    const errorData = {
      route: context.route || window.location.pathname,
      method: 'CLIENT',
      status: 0,
      code: error?.code || 'CLIENT_ERROR',
      message: error?.message || 'Unknown client error',
      correlation_id: error?.correlationId || crypto.randomUUID(),
      user_id: context.userId,
      safe_context: {
        action: context.action,
        userAgent: navigator.userAgent,
        url: window.location.href,
        timestamp: new Date().toISOString()
      }
    };

    // Use regular client for client-side logging
    await supabase
      .from('error_events')
      .insert(errorData);

    console.error(`[CLIENT:${errorData.correlation_id}] ${errorData.message}`, error);
  } catch (logError) {
    console.error('Failed to log client error:', logError);
    console.error('Original client error:', error);
  }
}