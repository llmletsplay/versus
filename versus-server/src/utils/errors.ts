/**
 * Custom Error Classes
 * Provides better error handling and classification
 */

export enum ErrorCode {
  // Authentication & Authorization
  UNAUTHORIZED = 'UNAUTHORIZED',
  FORBIDDEN = 'FORBIDDEN',
  INVALID_CREDENTIALS = 'INVALID_CREDENTIALS',
  TOKEN_EXPIRED = 'TOKEN_EXPIRED',
  ACCOUNT_DEACTIVATED = 'ACCOUNT_DEACTIVATED',

  // Validation
  VALIDATION_ERROR = 'VALIDATION_ERROR',
  INVALID_INPUT = 'INVALID_INPUT',
  MISSING_REQUIRED_FIELD = 'MISSING_REQUIRED_FIELD',

  // Resource Not Found
  NOT_FOUND = 'NOT_FOUND',
  USER_NOT_FOUND = 'USER_NOT_FOUND',
  GAME_NOT_FOUND = 'GAME_NOT_FOUND',

  // Business Logic
  DUPLICATE_RESOURCE = 'DUPLICATE_RESOURCE',

  // Payment & Billing
  PAYMENT_ERROR = 'PAYMENT_ERROR',
  PAYMENT_REQUIRED = 'PAYMENT_REQUIRED',
  INSUFFICIENT_FUNDS = 'INSUFFICIENT_FUNDS',
  PAYMENT_METHOD_INVALID = 'PAYMENT_METHOD_INVALID',

  // Rate Limiting
  RATE_LIMIT_EXCEEDED = 'RATE_LIMIT_EXCEEDED',
  QUOTA_EXCEEDED = 'QUOTA_EXCEEDED',

  // External Services
  EXTERNAL_SERVICE_ERROR = 'EXTERNAL_SERVICE_ERROR',
  EMAIL_SERVICE_ERROR = 'EMAIL_SERVICE_ERROR',

  // System
  INTERNAL_ERROR = 'INTERNAL_ERROR',
  DATABASE_ERROR = 'DATABASE_ERROR',
  CONFIGURATION_ERROR = 'CONFIGURATION_ERROR',
  SERVICE_UNAVAILABLE = 'SERVICE_UNAVAILABLE',
}

export class AppError extends Error {
  public readonly code: ErrorCode;
  public readonly statusCode: number;
  public readonly isOperational: boolean;
  public readonly context?: Record<string, any>;

  constructor(
    code: ErrorCode,
    message: string,
    statusCode = 500,
    isOperational = true,
    context?: Record<string, any>
  ) {
    super(message);
    this.name = this.constructor.name;
    this.code = code;
    this.statusCode = statusCode;
    this.isOperational = isOperational;
    this.context = context;

    // Maintains proper stack trace for where our error was thrown
    Error.captureStackTrace(this, this.constructor);
  }

  toJSON() {
    return {
      name: this.name,
      code: this.code,
      message: this.message,
      statusCode: this.statusCode,
      isOperational: this.isOperational,
      ...(this.context && { context: this.context }),
    };
  }
}

// Specific error classes for common scenarios
export class ValidationError extends AppError {
  constructor(message: string, field?: string, value?: any) {
    super(
      ErrorCode.VALIDATION_ERROR,
      message,
      400,
      true,
      field && value ? { field, value } : undefined
    );
  }
}

export class AuthenticationError extends AppError {
  constructor(message = 'Authentication required') {
    super(ErrorCode.UNAUTHORIZED, message, 401);
  }
}

export class AuthorizationError extends AppError {
  constructor(message = 'Insufficient permissions') {
    super(ErrorCode.FORBIDDEN, message, 403);
  }
}

export class NotFoundError extends AppError {
  constructor(resource = 'Resource', identifier?: string) {
    const message = identifier
      ? `${resource} with id '${identifier}' not found`
      : `${resource} not found`;
    const code = resource.toLowerCase().includes('user')
      ? ErrorCode.USER_NOT_FOUND
      : resource.toLowerCase().includes('game')
        ? ErrorCode.GAME_NOT_FOUND
        : ErrorCode.NOT_FOUND;

    super(
      code,
      message,
      404,
      true,
      identifier ? { [resource.toLowerCase()]: identifier } : undefined
    );
  }
}

export class ConflictError extends AppError {
  constructor(message: string, resource?: string) {
    super(ErrorCode.DUPLICATE_RESOURCE, message, 409, true, resource ? { resource } : undefined);
  }
}

export class BusinessLogicError extends AppError {
  constructor(code: ErrorCode, message: string, context?: Record<string, any>) {
    super(code, message, 422, true, context);
  }
}

export class PaymentError extends AppError {
  constructor(message: string, providerCode?: string, context?: Record<string, any>) {
    super(ErrorCode.PAYMENT_ERROR, message, 402, true, {
      providerCode,
      ...context,
    });
  }
}

export class RateLimitError extends AppError {
  constructor(limit: number, windowMs: number) {
    super(
      ErrorCode.RATE_LIMIT_EXCEEDED,
      `Rate limit exceeded. Maximum ${limit} requests per ${windowMs / 1000} seconds.`,
      429,
      true,
      { limit, windowMs }
    );
  }
}

export class ExternalServiceError extends AppError {
  constructor(service: string, message: string, originalError?: Error) {
    super(ErrorCode.EXTERNAL_SERVICE_ERROR, `${service} error: ${message}`, 502, true, {
      service,
      originalError: originalError?.message,
    });
  }
}

export class DatabaseError extends AppError {
  constructor(message: string, query?: string, originalError?: Error) {
    super(ErrorCode.DATABASE_ERROR, `Database error: ${message}`, 500, true, {
      query: query?.substring(0, 100), // First 100 chars of query for debugging
      originalError: originalError?.message,
    });
  }
}

export class ConfigurationError extends AppError {
  constructor(message: string, configKey?: string) {
    super(
      ErrorCode.CONFIGURATION_ERROR,
      `Configuration error: ${message}`,
      500,
      true,
      configKey ? { configKey } : undefined
    );
  }
}

// Helper functions for throwing errors
export const throwError = {
  validation: (message: string, field?: string) => {
    throw new ValidationError(message, field);
  },

  unauthorized: (message?: string) => {
    throw new AuthenticationError(message);
  },

  forbidden: (message?: string) => {
    throw new AuthorizationError(message);
  },

  notFound: (resource: string, identifier?: string) => {
    throw new NotFoundError(resource, identifier);
  },

  conflict: (message: string, resource?: string) => {
    throw new ConflictError(message, resource);
  },

  business: (code: ErrorCode, message: string, context?: Record<string, any>) => {
    throw new BusinessLogicError(code, message, context);
  },

  payment: (message: string, providerCode?: string, context?: Record<string, any>) => {
    throw new PaymentError(message, providerCode, context);
  },

  rateLimit: (limit: number, windowMs: number) => {
    throw new RateLimitError(limit, windowMs);
  },

  external: (service: string, message: string, originalError?: Error) => {
    throw new ExternalServiceError(service, message, originalError);
  },

  database: (message: string, query?: string, originalError?: Error) => {
    throw new DatabaseError(message, query, originalError);
  },

  config: (message: string, configKey?: string) => {
    throw new ConfigurationError(message, configKey);
  },
};

// Type guard to check if error is an AppError
export function isAppError(error: unknown): error is AppError {
  return error instanceof AppError;
}

// Convert any error to AppError
export function toAppError(error: unknown, defaultMessage = 'Internal server error'): AppError {
  if (isAppError(error)) {
    return error;
  }

  if (error instanceof Error) {
    // Check for common error patterns
    if (error.message.includes('duplicate key')) {
      return new ConflictError('Resource already exists');
    }

    if (error.message.includes('not found')) {
      return new NotFoundError('Resource');
    }

    if (error.message.includes('unauthorized') || error.message.includes('authentication')) {
      return new AuthenticationError(error.message);
    }

    if (error.message.includes('forbidden') || error.message.includes('permission')) {
      return new AuthorizationError(error.message);
    }

    // Generic error
    return new AppError(ErrorCode.INTERNAL_ERROR, error.message, 500, true);
  }

  // Unknown error type
  return new AppError(ErrorCode.INTERNAL_ERROR, defaultMessage, 500, true);
}
