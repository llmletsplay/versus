import type { Context, Next } from 'hono';
import { logger } from '../utils/logger.js';

// NOTE: In-memory rate limiter for single-instance deployments
// TODO: For distributed deployments, use Redis or similar store
interface RateLimitStore {
  [key: string]: {
    count: number;
    resetTime: number;
  };
}

const store: RateLimitStore = {};

// Cleanup expired entries periodically. `unref()` keeps this from pinning test
// processes or short-lived CLIs that import the middleware module.
const cleanupInterval = setInterval(() => {
  const now = Date.now();
  for (const key in store) {
    const entry = store[key];
    if (entry && entry.resetTime < now) {
      delete store[key];
    }
  }
}, 60000); // Cleanup every minute
cleanupInterval.unref?.();

/**
 * SECURITY: Rate limiting middleware to prevent DoS and brute force attacks
 * CRITICAL: This is a production security requirement
 */
export function createRateLimiter(options: {
  namespace: string;
  windowMs: number; // Time window in milliseconds
  max: number; // Max requests per window
  message?: string | { error: string; retryAfter?: number | string };
  keyGenerator?: (c: Context) => string;
}) {
  const { namespace, windowMs, max, message, keyGenerator } = options;

  return async (c: Context, next: Next): Promise<void> => {
    // SECURITY: Generate key for rate limiting
    // Use user ID if authenticated, otherwise use IP
    const key = keyGenerator
      ? keyGenerator(c)
      : c.get('user')?.id ||
        c.req.header('x-forwarded-for') ||
        c.req.header('x-real-ip') ||
        'unknown';
    const storageKey = `${namespace}:${key}`;

    const now = Date.now();
    const resetTime = now + windowMs;

    // Initialize or get current entry
    if (!store[storageKey] || store[storageKey].resetTime < now) {
      store[storageKey] = {
        count: 0,
        resetTime,
      };
    }

    // Increment count
    store[storageKey].count++;

    // SECURITY: Set rate limit headers
    c.res.headers.set('X-RateLimit-Limit', max.toString());
    c.res.headers.set(
      'X-RateLimit-Remaining',
      Math.max(0, max - store[storageKey].count).toString()
    );
    c.res.headers.set('X-RateLimit-Reset', new Date(store[storageKey].resetTime).toISOString());

    // Check if limit exceeded
    if (store[storageKey].count > max) {
      // SECURITY: Log rate limit violation for security monitoring
      logger.warn('Rate limit exceeded', {
        namespace,
        key,
        count: store[storageKey].count,
        limit: max,
        path: c.req.path,
        method: c.req.method,
        userAgent: c.req.header('user-agent'),
      });

      // SECURITY: Return 429 Too Many Requests
      const response =
        typeof message === 'string'
          ? { error: message }
          : message || { error: 'Too many requests, please try again later' };

      return c.json(response, 429) as any;
    }

    await next();
  };
}

// PRECONFIGURED: Common rate limiters for different endpoint types

/**
 * SECURITY: General API rate limit
 * Allows 100 requests per 15 minutes per IP/user
 */
export const apiRateLimit = createRateLimiter({
  namespace: 'api',
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 100,
  message: {
    error: 'Too many requests. Please try again in a few minutes.',
    retryAfter: '15 minutes',
  },
});

/**
 * SECURITY: Strict rate limit for authentication endpoints
 * Prevents brute force attacks - 5 attempts per 15 minutes
 */
export const authRateLimit = createRateLimiter({
  namespace: 'auth',
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 5,
  message: {
    error: 'Too many authentication attempts. Please try again in 15 minutes.',
    retryAfter: '15 minutes',
  },
  keyGenerator: (c: Context) => {
    // SECURITY: Always use IP for auth, never user ID
    // Prevents authenticated users from bypassing limits
    return c.req.header('x-forwarded-for') || c.req.header('x-real-ip') || 'unknown';
  },
});

/**
 * SECURITY: Game creation rate limit
 * Prevents game spam - 10 games per hour per user
 */
export const gameCreationRateLimit = createRateLimiter({
  namespace: 'game-create',
  windowMs: 60 * 60 * 1000, // 1 hour
  max: 10,
  message: {
    error: 'Game creation limit reached. Please try again later.',
    retryAfter: '1 hour',
  },
});

/**
 * SECURITY: Move submission rate limit
 * Prevents move spam - 60 moves per minute per game
 */
export const moveRateLimit = createRateLimiter({
  namespace: 'move',
  windowMs: 60 * 1000, // 1 minute
  max: 60,
  message: {
    error: 'Move rate limit exceeded. Please slow down.',
    retryAfter: '1 minute',
  },
  keyGenerator: (c: Context) => {
    const gameId = c.req.param('gameId');
    const userId = c.get('user')?.id || c.req.header('x-forwarded-for') || 'unknown';
    return `move:${gameId}:${userId}`;
  },
});

/**
 * SECURITY: Health check rate limit
 * Prevents monitoring abuse - 30 requests per minute
 */
export const healthRateLimit = createRateLimiter({
  namespace: 'health',
  windowMs: 60 * 1000, // 1 minute
  max: 30,
  message: {
    error: 'Health check rate limit exceeded',
  },
});
