/**
 * Error handling middleware
 * Provides consistent error responses across the API
 */

import type { Context, Next } from 'hono';
import { HTTPException } from 'hono/http-exception';
import { logger } from '../utils/logger.js';
import {
  AppError,
  isAppError,
  toAppError,
  ValidationError,
  AuthenticationError,
  AuthorizationError,
  NotFoundError,
  ConflictError,
  BusinessLogicError,
  PaymentError,
  RateLimitError,
  ExternalServiceError,
  DatabaseError,
  ConfigurationError,
  ErrorCode,
} from '../utils/errors.js';
import { SubscriptionError } from '../types/subscription.js';
import { GameError } from '../utils/error-handler.js';

export interface ErrorResponse {
  success: false;
  error: string;
  code: string;
  details?: any;
  requestId?: string;
}

export function errorHandler() {
  return async (c: Context, next: Next): Promise<void> => {
    const requestId = crypto.randomUUID();
    c.set('requestId', requestId);

    try {
      await next();
    } catch (error) {
      const errorResponse = createErrorResponse(error, requestId);

      // Log the error
      logger.error('API Error', {
        error: error instanceof Error ? error.message : String(error),
        code: errorResponse.code,
        statusCode: errorResponse.statusCode,
        requestId,
        path: c.req.path,
        method: c.req.method,
        userId: c.get('user')?.userId,
      });

      // Send error response
      await c.json(errorResponse, errorResponse.statusCode as any);
    }
  };
}

function createErrorResponse(
  error: unknown,
  requestId: string
): ErrorResponse & { statusCode: number } {
  // Handle Hono HTTP exceptions
  if (error instanceof HTTPException) {
    return {
      success: false,
      error: error.message,
      code: 'HTTP_EXCEPTION',
      requestId,
      statusCode: error.status,
    };
  }

  // Handle GameError (from game engine) - convert to AppError
  if (error instanceof GameError) {
    // Convert GameError to appropriate AppError
    let appError: AppError;

    switch (error.code) {
      case 'AUTHENTICATION_REQUIRED':
      case 'INVALID_TOKEN':
      case 'USER_INACTIVE':
        appError = new AuthenticationError(error.message);
        break;
      case 'INSUFFICIENT_PERMISSIONS':
        appError = new AuthorizationError(error.message);
        break;
      case 'GAME_NOT_FOUND':
      case 'USER_NOT_FOUND':
      case 'GAME_TYPE_NOT_FOUND':
        appError = new NotFoundError(
          'Resource',
          error.context?.gameId || error.context?.details?.toString()
        );
        break;
      case 'VALIDATION_ERROR':
      case 'INVALID_MOVE_FORMAT':
      case 'INVALID_GAME_CONFIG':
      case 'INVALID_PLAYER':
      case 'INVALID_POSITION':
        appError = new ValidationError(
          error.message,
          error.context?.details?.field,
          error.context?.details?.value
        );
        break;
      case 'RATE_LIMIT_EXCEEDED':
        appError = new RateLimitError(100, 900000); // Default values
        break;
      case 'DATABASE_ERROR':
      case 'PERSISTENCE_ERROR':
        appError = new DatabaseError(error.message);
        break;
      default:
        // Default to internal error
        appError = new AppError(
          ErrorCode.INTERNAL_ERROR,
          error.message,
          500,
          error.isOperational,
          error.context
        );
    }

    return {
      success: false,
      error: appError.message,
      code: appError.code,
      details: appError.context,
      requestId,
      statusCode: appError.statusCode,
    };
  }

  // Handle our AppError classes
  if (isAppError(error)) {
    return {
      success: false,
      error: error.message,
      code: error.code,
      details: error.context,
      requestId,
      statusCode: error.statusCode,
    };
  }

  // Handle subscription errors (legacy)
  if (error instanceof SubscriptionError) {
    const statusCodeMap: Record<string, number> = {
      INVALID_TIER: 400,
      NO_SUBSCRIPTION_TO_CANCEL: 400,
      NO_SUBSCRIPTION_TO_RESUME: 400,
      NO_PAYMENT_METHOD: 402,
      CANNOT_DOWNGRADE_TO_FREE: 400,
      GET_SUBSCRIPTION_FAILED: 500,
      UPSERT_SUBSCRIPTION_FAILED: 500,
      CANCEL_SUBSCRIPTION_FAILED: 500,
      RESUME_SUBSCRIPTION_FAILED: 500,
      CHANGE_TIER_FAILED: 500,
      GET_USAGE_FAILED: 500,
    };

    return {
      success: false,
      error: error.message,
      code: error.code,
      requestId,
      statusCode: statusCodeMap[error.code] || 500,
    };
  }

  // Handle validation errors (Zod)
  if (error && typeof error === 'object' && 'issues' in error) {
    return {
      success: false,
      error: 'Validation failed',
      code: 'VALIDATION_ERROR',
      details: error,
      requestId,
      statusCode: 400,
    };
  }

  // Handle JWT errors
  if (error instanceof Error && error.message.includes('jwt')) {
    return {
      success: false,
      error: 'Authentication failed',
      code: 'AUTH_ERROR',
      requestId,
      statusCode: 401,
    };
  }

  // Convert unknown errors to AppError
  const appError = toAppError(error);
  return {
    success: false,
    error: appError.message,
    code: appError.code,
    details: appError.context,
    requestId,
    statusCode: appError.statusCode,
  };
}

/**
 * Common error creators using the centralized AppError classes
 */
export const errors = {
  badRequest: (message: string = 'Bad request', field?: string, value?: any): never => {
    throw new ValidationError(message, field, value);
  },

  unauthorized: (message?: string): never => {
    throw new AuthenticationError(message);
  },

  forbidden: (message?: string): never => {
    throw new AuthorizationError(message);
  },

  notFound: (resource: string = 'Resource', identifier?: string): never => {
    throw new NotFoundError(resource, identifier);
  },

  conflict: (message: string, resource?: string): never => {
    throw new ConflictError(message, resource);
  },

  tooManyRequests: (limit: number, windowMs: number): never => {
    throw new RateLimitError(limit, windowMs);
  },

  internal: (message: string = 'Internal server error', context?: Record<string, any>): never => {
    throw new AppError(ErrorCode.INTERNAL_ERROR, message, 500, true, context);
  },

  serviceUnavailable: (message: string = 'Service unavailable'): never => {
    throw new ExternalServiceError('Service', message);
  },

  payment: (message: string, stripeCode?: string): never => {
    throw new PaymentError(message, stripeCode);
  },

  database: (message: string, query?: string, originalError?: Error): never => {
    throw new DatabaseError(message, query, originalError);
  },

  config: (message: string, configKey?: string): never => {
    throw new ConfigurationError(message, configKey);
  },
};
