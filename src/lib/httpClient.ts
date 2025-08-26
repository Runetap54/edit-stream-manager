import { UpstreamError } from './errors';

export interface FetchOptions {
  method?: string;
  headers?: Record<string, string>;
  body?: any;
  timeoutMs?: number;
  correlationId?: string;
}

export async function fetchJson<T = any>(
  url: string,
  options: FetchOptions = {}
): Promise<T> {
  const {
    method = 'GET',
    headers = {},
    body,
    timeoutMs = 20000,
    correlationId
  } = options;

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const fetchHeaders: Record<string, string> = {
      'Content-Type': 'application/json',
      ...headers,
    };

    if (correlationId) {
      fetchHeaders['x-correlation-id'] = correlationId;
    }

    const response = await fetch(url, {
      method,
      headers: fetchHeaders,
      body: body ? JSON.stringify(body) : undefined,
      signal: controller.signal,
    });

    clearTimeout(timeoutId);

    if (!response.ok) {
      let bodySnippet: string | undefined;
      try {
        const text = await response.text();
        bodySnippet = text.length > 500 ? text.substring(0, 500) + '...' : text;
      } catch {
        bodySnippet = 'Unable to read response body';
      }

      throw new UpstreamError(
        url,
        response.status,
        `HTTP ${response.status} from ${url}`,
        bodySnippet,
        { correlationId }
      );
    }

    const contentType = response.headers.get('content-type');
    if (contentType && contentType.includes('application/json')) {
      return await response.json();
    }

    return (await response.text()) as unknown as T;
  } catch (error) {
    clearTimeout(timeoutId);
    
    if (error.name === 'AbortError') {
      throw new UpstreamError(
        url,
        408,
        `Request timeout after ${timeoutMs}ms`,
        undefined,
        { correlationId, cause: error }
      );
    }

    if (error instanceof UpstreamError) {
      throw error;
    }

    throw new UpstreamError(
      url,
      0,
      `Network error: ${error.message}`,
      undefined,
      { correlationId, cause: error }
    );
  }
}