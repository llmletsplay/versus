/**
 * Validation middleware utilities
 * Centralizes validation logic and error handling
 */

import type { Context, Next } from 'hono';
import { zValidator } from '@hono/zod-validator';
import { z } from 'zod';
import { errors } from './error-handler.js';

/**
 * Creates a validation middleware with proper error handling
 */
export function validate<T>(target: 'json' | 'query' | 'param', schema: z.ZodSchema<T>) {
  return zValidator(target, schema, (result, c) => {
    if (!result.success) {
      const errorMessage = result.error.errors
        .map((e) => `${e.path.join('.')}: ${e.message}`)
        .join(', ');
      throw errors.badRequest(`Validation failed: ${errorMessage}`);
    }
  });
}

/**
 * Common validation schemas
 */
export const schemas = {
  // Pagination
  pagination: z.object({
    limit: z.coerce.number().min(1).max(100).default(20),
    offset: z.coerce.number().min(0).default(0),
  }),

  // Date ranges
  dateRange: z
    .object({
      startDate: z.string().datetime().optional(),
      endDate: z.string().datetime().optional(),
    })
    .refine(
      (data) => {
        if (!data.startDate || !data.endDate) return true;
        return new Date(data.startDate) <= new Date(data.endDate);
      },
      {
        message: 'Start date must be before end date',
      }
    ),

  // User related
  userUpdate: z.object({
    email: z.string().email().optional(),
    name: z.string().min(1).max(100).optional(),
  }),

  // Game related
  gameSession: z.object({
    gameType: z.string().min(1),
    players: z.array(z.string()).min(1),
    settings: z.record(z.any()).optional(),
  }),
};

/**
 * Middleware to check if user is authenticated
 */
export function requireAuth() {
  return async (c: Context, next: Next) => {
    const user = c.get('user');
    if (!user) {
      throw errors.unauthorized('Authentication required');
    }
    await next();
  };
}

/**
 * Middleware to check user role/permissions
 */
export function requireRole(roles: string[]) {
  return async (c: Context, next: Next) => {
    const user = c.get('user');
    if (!user) {
      throw errors.unauthorized('Authentication required');
    }
    if (!roles.includes(user.role)) {
      throw errors.forbidden('Insufficient permissions');
    }
    await next();
  };
}

/**
 * Generic validation middleware using zod schemas
 */
export function validateRequest(schema: z.ZodSchema, target: 'json' | 'query' | 'params' = 'json') {
  return zValidator(target as any, schema, (result, c) => {
    if (!result.success) {
      const errorMessage =
        result.error?.errors?.map((e: any) => `${e.path.join('.')}: ${e.message}`).join(', ') ||
        'Validation failed';
      throw errors.badRequest(errorMessage);
    }
  });
}
