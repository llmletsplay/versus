import rateLimit from 'express-rate-limit';
import { Request, Response } from 'express';

// General API rate limiting
export const apiLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 100, // limit each IP to 100 requests per windowMs
  message: {
    success: false,
    error: 'Too many requests from this IP, please try again later',
    code: 'RATE_LIMIT_EXCEEDED',
    retryAfter: '15 minutes',
  },
  standardHeaders: true, // Return rate limit info in the `RateLimit-*` headers
  legacyHeaders: false, // Disable the `X-RateLimit-*` headers
  keyGenerator: (req: Request) => {
    // Use IP address as the key
    return req.ip || req.connection.remoteAddress || 'unknown';
  },
  handler: (req: Request, res: Response) => {
    res.status(429).json({
      success: false,
      error: 'Too many requests from this IP, please try again later',
      code: 'RATE_LIMIT_EXCEEDED',
      retryAfter: '15 minutes',
    });
  },
});

// Strict rate limiting for authentication endpoints
export const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 10, // limit each IP to 10 auth requests per windowMs
  message: {
    success: false,
    error: 'Too many authentication attempts, please try again later',
    code: 'AUTH_RATE_LIMIT_EXCEEDED',
    retryAfter: '15 minutes',
  },
  standardHeaders: true,
  legacyHeaders: false,
  skipSuccessfulRequests: true, // Don't count successful requests
  keyGenerator: (req: Request) => {
    // Use IP address as the key
    return req.ip || req.connection.remoteAddress || 'unknown';
  },
  handler: (req: Request, res: Response) => {
    res.status(429).json({
      success: false,
      error: 'Too many authentication attempts from this IP, please try again later',
      code: 'AUTH_RATE_LIMIT_EXCEEDED',
      retryAfter: '15 minutes',
    });
  },
});

// Game creation rate limiting
export const gameCreationLimiter = rateLimit({
  windowMs: 60 * 60 * 1000, // 1 hour
  max: 50, // limit each IP to 50 game creations per hour
  message: {
    success: false,
    error: 'Too many games created, please try again later',
    code: 'GAME_CREATION_LIMIT_EXCEEDED',
    retryAfter: '1 hour',
  },
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: (req: Request) => {
    // Use IP address as the key
    return req.ip || req.connection.remoteAddress || 'unknown';
  },
  handler: (req: Request, res: Response) => {
    res.status(429).json({
      success: false,
      error: 'Too many games created from this IP, please try again later',
      code: 'GAME_CREATION_LIMIT_EXCEEDED',
      retryAfter: '1 hour',
    });
  },
});

// Move rate limiting - more lenient for gameplay
export const moveLimiter = rateLimit({
  windowMs: 1 * 60 * 1000, // 1 minute
  max: 100, // limit each IP to 100 moves per minute
  message: {
    success: false,
    error: 'Too many moves, please slow down',
    code: 'MOVE_RATE_LIMIT_EXCEEDED',
    retryAfter: '1 minute',
  },
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: (req: Request) => {
    // Use IP address as the key
    return req.ip || req.connection.remoteAddress || 'unknown';
  },
  handler: (req: Request, res: Response) => {
    res.status(429).json({
      success: false,
      error: 'Too many moves from this IP, please slow down',
      code: 'MOVE_RATE_LIMIT_EXCEEDED',
      retryAfter: '1 minute',
    });
  },
});
