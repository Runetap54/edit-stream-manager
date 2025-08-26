import { v4 as uuidv4 } from 'uuid';

export interface AppErrorOptions {
  cause?: Error;
  correlationId?: string;
  safeContext?: Record<string, any>;
}

export class AppError extends Error {
  public readonly code: string;
  public readonly status: number;
  public readonly correlationId: string;
  public readonly safeContext: Record<string, any>;
  public readonly cause?: Error;

  constructor(
    code: string,
    status: number,
    message: string,
    options: AppErrorOptions = {}
  ) {
    super(message);
    this.name = 'AppError';
    this.code = code;
    this.status = status;
    this.correlationId = options.correlationId || uuidv4();
    this.safeContext = options.safeContext || {};
    this.cause = options.cause;
  }
}

export class ValidationError extends AppError {
  constructor(message: string, options: AppErrorOptions = {}) {
    super('VALIDATION_ERROR', 400, message, options);
    this.name = 'ValidationError';
  }
}

export class AuthError extends AppError {
  constructor(message: string = 'Authentication required', options: AppErrorOptions = {}) {
    super('AUTH_ERROR', 401, message, options);
    this.name = 'AuthError';
  }
}

export class ForbiddenError extends AppError {
  constructor(message: string = 'Access denied', options: AppErrorOptions = {}) {
    super('FORBIDDEN_ERROR', 403, message, options);
    this.name = 'ForbiddenError';
  }
}

export class NotFoundError extends AppError {
  constructor(message: string = 'Resource not found', options: AppErrorOptions = {}) {
    super('NOT_FOUND', 404, message, options);
    this.name = 'NotFoundError';
  }
}

export class ConflictError extends AppError {
  constructor(message: string = 'Resource conflict', options: AppErrorOptions = {}) {
    super('CONFLICT_ERROR', 409, message, options);
    this.name = 'ConflictError';
  }
}

export class RateLimitError extends AppError {
  constructor(message: string = 'Rate limit exceeded', options: AppErrorOptions = {}) {
    super('RATE_LIMITED', 429, message, options);
    this.name = 'RateLimitError';
  }
}

export class UpstreamError extends AppError {
  public readonly endpoint: string;
  public readonly upstreamStatus: number;
  public readonly bodySnippet?: string;

  constructor(
    endpoint: string,
    upstreamStatus: number,
    message: string = 'Upstream service error',
    bodySnippet?: string,
    options: AppErrorOptions = {}
  ) {
    super('UPSTREAM_ERROR', 502, message, options);
    this.name = 'UpstreamError';
    this.endpoint = endpoint;
    this.upstreamStatus = upstreamStatus;
    this.bodySnippet = bodySnippet;
  }
}

export class ServerError extends AppError {
  constructor(message: string = 'Internal server error', options: AppErrorOptions = {}) {
    super('SERVER_ERROR', 500, message, options);
    this.name = 'ServerError';
  }
}

export interface ErrorResponse {
  error: {
    code: string;
    message: string;
    detail?: any;
    upstream?: {
      endpoint: string;
      status: number;
      bodySnippet?: string;
    };
    correlationId: string;
  };
  ok: false;
}

export function toErrorResponse(err: AppError): ErrorResponse {
  const response: ErrorResponse = {
    error: {
      code: err.code,
      message: err.message,
      correlationId: err.correlationId,
    },
    ok: false,
  };

  if (err.safeContext && Object.keys(err.safeContext).length > 0) {
    response.error.detail = err.safeContext;
  }

  if (err instanceof UpstreamError) {
    response.error.upstream = {
      endpoint: err.endpoint,
      status: err.upstreamStatus,
      bodySnippet: err.bodySnippet,
    };
  }

  return response;
}

export function isAppError(error: any): error is AppError {
  return error instanceof AppError;
}