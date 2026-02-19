import { Context, Next } from 'hono';
import jwt from 'jsonwebtoken';
import type { JWTPayload, UserRole } from '../types/auth.js';
import { logger } from '../utils/logger.js';

/**
 * Hono-compatible JWT authentication middleware.
 *
 * Extracts and verifies the Bearer token from the Authorization header,
 * then sets `jwtPayload` on the Hono context so downstream handlers can
 * access the authenticated user via `c.get('jwtPayload')`.
 */

// Extend Hono's context variable map so TypeScript knows about `jwtPayload`
export type AuthVariables = {
  jwtPayload: JWTPayload;
};

/**
 * Middleware: require a valid JWT Bearer token.
 * Returns 401 if token is missing/invalid/expired.
 */
export async function requireAuth(c: Context, next: Next): Promise<Response | void> {
  const authHeader = c.req.header('Authorization');

  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return c.json({ success: false, error: 'Access token required', code: 'NO_TOKEN' }, 401);
  }

  const token = authHeader.slice(7); // strip "Bearer "

  const secret = process.env.JWT_SECRET;
  if (!secret) {
    logger.error('JWT_SECRET is not configured');
    return c.json({ success: false, error: 'Server misconfiguration', code: 'SERVER_ERROR' }, 500);
  }

  try {
    const payload = jwt.verify(token, secret) as JWTPayload;
    c.set('jwtPayload', payload);
    await next();
  } catch (_err) {
    return c.json(
      { success: false, error: 'Invalid or expired token', code: 'INVALID_TOKEN' },
      401
    );
  }
}

/**
 * Middleware: optionally attach JWT payload if a valid token is present.
 * Does NOT reject unauthenticated requests — use for public endpoints
 * that behave differently when a user is logged in.
 */
export async function optionalAuth(c: Context, next: Next) {
  const authHeader = c.req.header('Authorization');

  if (authHeader && authHeader.startsWith('Bearer ')) {
    const token = authHeader.slice(7);
    const secret = process.env.JWT_SECRET;

    if (secret) {
      try {
        const payload = jwt.verify(token, secret) as JWTPayload;
        c.set('jwtPayload', payload);
      } catch {
        // Invalid token — continue without user context
      }
    }
  }

  await next();
}

/**
 * Middleware factory: require a specific role (or admin).
 * Must be used AFTER `requireAuth`.
 */
export function requireRole(requiredRole: UserRole) {
  return async (c: Context, next: Next): Promise<Response | void> => {
    const payload = c.get('jwtPayload') as JWTPayload | undefined;

    if (!payload) {
      return c.json({ success: false, error: 'Authentication required', code: 'NO_AUTH' }, 401);
    }

    if (payload.role !== requiredRole && payload.role !== 'admin') {
      return c.json(
        {
          success: false,
          error: 'Insufficient permissions',
          code: 'INSUFFICIENT_PERMISSIONS',
        },
        403
      );
    }

    await next();
  };
}

/**
 * Helper: extract the authenticated userId from the Hono context.
 * Throws if no JWT payload is present (use after `requireAuth`).
 */
export function getAuthUserId(c: Context): string {
  const payload = c.get('jwtPayload') as JWTPayload | undefined;
  if (!payload) {
    throw new Error('UNAUTHORIZED');
  }
  return payload.userId;
}
