import rateLimit from 'express-rate-limit';
import { Request, Response } from 'express';
import { logger } from '../utils/logger.js';

// SECURITY: Rate limiting configuration - CRITICAL for DDoS protection
// PERF: Prevents server overload from excessive requests

// SECURITY: Store for tracking request counts
// DEBT: Consider using Redis for distributed deployments
const store = new Map<string, { count: number; resetTime: number }>();

// SECURITY: Custom key generator for rate limiting
// Combines IP and user ID for accurate tracking
function getKey(req: Request): string {
  // SECURITY: Use user ID if authenticated, otherwise use IP
  const userId = (req as any).user?.userId;
  const ip = req.ip || req.socket.remoteAddress || 'unknown';
  return userId ? `user:${userId}` : `ip:${ip}`;
}

// SECURITY: Standard rate limiter for general API endpoints
// 100 requests per 15 minutes per IP/user
export const standardRateLimit = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 100, // Limit each IP/user to 100 requests per windowMs
  message: 'Too many requests from this IP/user, please try again later',
  standardHeaders: true, // Return rate limit info in headers
  legacyHeaders: false, // Disable X-RateLimit headers
  keyGenerator: getKey,
  handler: (req: Request, res: Response) => {
    // SECURITY: Log rate limit violations for monitoring
    logger.warn('Rate limit exceeded', {
      key: getKey(req),
      path: req.path,
      method: req.method,
      ip: req.ip,
      userAgent: req.get('User-Agent'),
    });

    res.status(429).json({
      error: 'Too Many Requests',
      message: 'Rate limit exceeded. Please try again later.',
      code: 'RATE_LIMIT_EXCEEDED',
      retryAfter: res.getHeader('Retry-After'),
    });
  },
});

// SECURITY: Strict rate limiter for authentication endpoints
// CRITICAL: Prevents brute force attacks on login/register
// 5 attempts per 15 minutes per IP
export const authRateLimit = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 5, // Maximum 5 auth attempts
  message: 'Too many authentication attempts, please try again later',
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: (req: Request) => {
    // SECURITY: Auth limiting by IP only, not user
    return `auth:${req.ip || req.socket.remoteAddress || 'unknown'}`;
  },
  handler: (req: Request, res: Response) => {
    // SECURITY: Log auth rate limit violations - potential attack
    logger.error('Authentication rate limit exceeded - possible brute force attempt', {
      ip: req.ip,
      path: req.path,
      userAgent: req.get('User-Agent'),
      timestamp: Date.now(),
    });

    res.status(429).json({
      error: 'Too Many Authentication Attempts',
      message: 'Please wait 15 minutes before trying again',
      code: 'AUTH_RATE_LIMIT_EXCEEDED',
      retryAfter: res.getHeader('Retry-After'),
    });
  },
  skipSuccessfulRequests: false, // Count all requests, not just failures
});

// SECURITY: Game creation rate limit - prevent spam
// 20 games per hour per user/IP
export const gameCreationRateLimit = rateLimit({
  windowMs: 60 * 60 * 1000, // 1 hour
  max: 20, // 20 games per hour
  message: 'Too many games created, please try again later',
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: getKey,
  handler: (req: Request, res: Response) => {
    logger.warn('Game creation rate limit exceeded', {
      key: getKey(req),
      ip: req.ip,
    });

    res.status(429).json({
      error: 'Too Many Games Created',
      message: 'You can create up to 20 games per hour',
      code: 'GAME_CREATION_RATE_LIMIT',
      retryAfter: res.getHeader('Retry-After'),
    });
  },
});

// SECURITY: Move rate limit - prevent rapid move spamming
// 300 moves per 5 minutes per game
export const moveRateLimit = rateLimit({
  windowMs: 5 * 60 * 1000, // 5 minutes
  max: 300, // 300 moves per 5 minutes
  message: 'Too many moves, please slow down',
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: (req: Request) => {
    // SECURITY: Rate limit per game + user/IP combination
    const gameId = req.params.gameId;
    const userKey = getKey(req);
    return `move:${gameId}:${userKey}`;
  },
  handler: (req: Request, res: Response) => {
    logger.warn('Move rate limit exceeded', {
      gameId: req.params.gameId,
      key: getKey(req),
      ip: req.ip,
    });

    res.status(429).json({
      error: 'Too Many Moves',
      message: 'Please slow down your move submissions',
      code: 'MOVE_RATE_LIMIT',
      retryAfter: res.getHeader('Retry-After'),
    });
  },
});

// SECURITY: API documentation rate limit - prevent scraping
// 30 requests per minute
export const docsRateLimit = rateLimit({
  windowMs: 60 * 1000, // 1 minute
  max: 30, // 30 requests per minute
  message: 'Too many documentation requests',
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: (req: Request) => {
    return `docs:${req.ip || 'unknown'}`;
  },
});

// SECURITY: Health check rate limit - prevent monitoring abuse
// 60 requests per minute
export const healthCheckRateLimit = rateLimit({
  windowMs: 60 * 1000, // 1 minute
  max: 60, // 60 health checks per minute
  message: 'Too many health check requests',
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: (req: Request) => {
    return `health:${req.ip || 'unknown'}`;
  },
});

// PERF: Clean up old entries periodically
setInterval(() => {
  const now = Date.now();
  for (const [key, data] of store.entries()) {
    if (data.resetTime < now) {
      store.delete(key);
    }
  }
}, 60 * 1000); // Clean up every minute

export default {
  standard: standardRateLimit,
  auth: authRateLimit,
  gameCreation: gameCreationRateLimit,
  move: moveRateLimit,
  docs: docsRateLimit,
  health: healthCheckRateLimit,
};
