import Redis from 'ioredis';
import { DatabaseProvider } from '../core/database.js';
import { PaymentService } from './payment-service.js';
import { logger } from '../utils/logger.js';
import type { Context, Next } from 'hono';

export interface RateLimitConfig {
  windowMs: number;
  max: number;
  skipSuccessfulRequests?: boolean;
  skipFailedRequests?: boolean;
  keyGenerator?: (c: Context) => string;
}

export interface TierRateLimits {
  [tierId: string]: {
    api: RateLimitConfig;
    auth: RateLimitConfig;
    gameCreation: RateLimitConfig;
    moves: RateLimitConfig;
    uploads: RateLimitConfig;
  };
}

// Rate limits based on subscription tiers
export const TIER_RATE_LIMITS: TierRateLimits = {
  free: {
    api: { windowMs: 15 * 60 * 1000, max: 100 }, // 100 requests/15min
    auth: { windowMs: 15 * 60 * 1000, max: 5 }, // 5 auth attempts/15min
    gameCreation: { windowMs: 60 * 60 * 1000, max: 10 }, // 10 games/hour
    moves: { windowMs: 60 * 1000, max: 30 }, // 30 moves/minute
    uploads: { windowMs: 60 * 60 * 1000, max: 5 }, // 5 uploads/hour
  },
  basic: {
    api: { windowMs: 15 * 60 * 1000, max: 1000 }, // 1k requests/15min
    auth: { windowMs: 15 * 60 * 1000, max: 10 }, // 10 auth attempts/15min
    gameCreation: { windowMs: 60 * 60 * 1000, max: 100 }, // 100 games/hour
    moves: { windowMs: 60 * 1000, max: 60 }, // 60 moves/minute
    uploads: { windowMs: 60 * 60 * 1000, max: 50 }, // 50 uploads/hour
  },
  pro: {
    api: { windowMs: 15 * 60 * 1000, max: 10000 }, // 10k requests/15min
    auth: { windowMs: 15 * 60 * 1000, max: 20 }, // 20 auth attempts/15min
    gameCreation: { windowMs: 60 * 60 * 1000, max: 1000 }, // 1k games/hour
    moves: { windowMs: 60 * 1000, max: 300 }, // 300 moves/minute
    uploads: { windowMs: 60 * 60 * 1000, max: 500 }, // 500 uploads/hour
  },
  enterprise: {
    api: { windowMs: 15 * 60 * 1000, max: -1 }, // Unlimited
    auth: { windowMs: 15 * 60 * 1000, max: -1 }, // Unlimited
    gameCreation: { windowMs: 60 * 60 * 1000, max: -1 }, // Unlimited
    moves: { windowMs: 60 * 1000, max: -1 }, // Unlimited
    uploads: { windowMs: 60 * 60 * 1000, max: -1 }, // Unlimited
  },
};

export class RateLimitService {
  private redis?: Redis;
  private memoryStore: Map<string, { count: number; resetTime: number }> = new Map();
  private db: DatabaseProvider;
  private paymentService: PaymentService;
  private useRedis: boolean;

  constructor(redisUrl?: string, db: DatabaseProvider, paymentService: PaymentService) {
    this.db = db;
    this.paymentService = paymentService;
    this.useRedis = !!redisUrl;

    if (redisUrl) {
      this.redis = new Redis(redisUrl, {
        retryDelayOnFailover: 100,
        maxRetriesPerRequest: 3,
        lazyConnect: true,
      });

      this.redis.on('error', (error) => {
        logger.error('Redis connection error', { error });
        this.useRedis = false;
      });

      this.redis.on('connect', () => {
        logger.info('Redis connected for rate limiting');
      });
    } else {
      logger.warn('Redis not configured, using memory store for rate limiting');
      this.startMemoryCleanup();
    }
  }

  /**
   * Create rate limiting middleware based on user tier
   */
  async createTieredRateLimiter(
    limitType: keyof TierRateLimits['free'],
    options?: Partial<RateLimitConfig>
  ) {
    return async (c: Context, next: Next) => {
      try {
        // Get user ID from context or IP
        const userId = c.get('user')?.userId;
        let tierId = 'free';

        // Get user's tier if authenticated
        if (userId) {
          const tier = await this.paymentService.getUserTier(userId);
          tierId = tier.id;
        }

        // Get rate limits for tier
        const tierLimits = TIER_RATE_LIMITS[tierId];
        const config = { ...tierLimits[limitType], ...options };

        // Skip if unlimited
        if (config.max === -1) {
          return next();
        }

        // Generate key
        const key = config.keyGenerator
          ? config.keyGenerator(c)
          : `${limitType}:${userId || c.req.header('x-forwarded-for') || 'unknown'}`;

        // Check rate limit
        const result = await this.checkRateLimit(key, config);

        // Set headers
        c.res.headers.set('X-RateLimit-Limit', config.max.toString());
        c.res.headers.set('X-RateLimit-Remaining', result.remaining.toString());
        c.res.headers.set('X-RateLimit-Reset', new Date(result.resetTime).toISOString());
        c.res.headers.set('X-RateLimit-Tier', tierId);

        // Log rate limit violation
        if (!result.allowed) {
          logger.warn('Rate limit exceeded', {
            key,
            tierId,
            limitType,
            userId,
            ip: c.req.header('x-forwarded-for'),
          });

          // Track analytics
          await this.trackRateLimitViolation(userId, limitType, tierId);

          return c.json(
            {
              success: false,
              error: 'Rate limit exceeded',
              code: 'RATE_LIMIT_EXCEEDED',
              retryAfter: Math.ceil((result.resetTime - Date.now()) / 1000),
              tier: tierId,
              limit: config.max,
            },
            429
          );
        }

        await next();
      } catch (error) {
        logger.error('Rate limiting error', { error });
        // Allow request on error
        await next();
      }
    };
  }

  /**
   * Check rate limit using Redis or memory
   */
  private async checkRateLimit(
    key: string,
    config: RateLimitConfig
  ): Promise<{ allowed: boolean; remaining: number; resetTime: number }> {
    const now = Date.now();
    const windowStart = now - config.windowMs;
    const resetTime = now + config.windowMs;

    if (this.useRedis && this.redis) {
      return await this.checkRedisRateLimit(key, config, now, windowStart, resetTime);
    } else {
      return this.checkMemoryRateLimit(key, config, now, windowStart, resetTime);
    }
  }

  /**
   * Check rate limit using Redis
   */
  private async checkRedisRateLimit(
    key: string,
    config: RateLimitConfig,
    now: number,
    windowStart: number,
    resetTime: number
  ): Promise<{ allowed: boolean; remaining: number; resetTime: number }> {
    try {
      // Use sliding window with Redis
      const pipeline = this.redis.pipeline();

      // Remove old entries
      pipeline.zremrangebyscore(key, 0, windowStart);

      // Count current entries
      pipeline.zcard(key);

      // Add current request
      pipeline.zadd(key, now, `${now}-${Math.random()}`);

      // Set expiration
      pipeline.expire(key, Math.ceil(config.windowMs / 1000));

      const results = await pipeline.exec();
      const count = (results?.[1]?.[1] as number) || 0;

      return {
        allowed: count < config.max,
        remaining: Math.max(0, config.max - count),
        resetTime,
      };
    } catch (error) {
      logger.error('Redis rate limit check failed', { error, key });
      // Fallback to memory store
      return this.checkMemoryRateLimit(key, config, now, windowStart, resetTime);
    }
  }

  /**
   * Check rate limit using memory store
   */
  private checkMemoryRateLimit(
    key: string,
    config: RateLimitConfig,
    now: number,
    windowStart: number,
    resetTime: number
  ): { allowed: boolean; remaining: number; resetTime: number } {
    const existing = this.memoryStore.get(key);

    if (!existing || existing.resetTime < now) {
      // New window
      this.memoryStore.set(key, {
        count: 1,
        resetTime: resetTime,
      });

      return {
        allowed: true,
        remaining: config.max - 1,
        resetTime,
      };
    }

    // Increment counter
    existing.count++;
    const remaining = Math.max(0, config.max - existing.count);

    return {
      allowed: existing.count <= config.max,
      remaining,
      resetTime: existing.resetTime,
    };
  }

  /**
   * Track rate limit violation for analytics
   */
  private async trackRateLimitViolation(
    userId: string | undefined,
    limitType: string,
    tierId: string
  ): Promise<void> {
    try {
      // Could track this in analytics service
      logger.info('Rate limit violation tracked', {
        userId,
        limitType,
        tierId,
      });
    } catch (error) {
      // Don't let tracking errors break rate limiting
    }
  }

  /**
   * Get current usage statistics
   */
  async getUsageStats(userId?: string): Promise<any> {
    try {
      const stats = {
        tier: 'free',
        limits: TIER_RATE_LIMITS.free,
        currentUsage: {},
      };

      if (userId) {
        const tier = await this.paymentService.getUserTier(userId);
        stats.tier = tier.id;
        stats.limits = TIER_RATE_LIMITS[tier.id];

        // Get current usage from database
        for (const limitType of Object.keys(stats.limits)) {
          const key = `${limitType}:${userId}`;
          if (this.useRedis && this.redis) {
            const count = await this.redis.zcard(key);
            stats.currentUsage[limitType] = count;
          } else {
            const memory = this.memoryStore.get(key);
            stats.currentUsage[limitType] = memory?.count || 0;
          }
        }
      }

      return stats;
    } catch (error) {
      logger.error('Failed to get usage stats', { error, userId });
      return null;
    }
  }

  /**
   * Reset rate limit for a user
   */
  async resetRateLimit(userId: string, limitType?: string): Promise<void> {
    try {
      if (limitType) {
        const key = `${limitType}:${userId}`;
        if (this.useRedis && this.redis) {
          await this.redis.del(key);
        } else {
          this.memoryStore.delete(key);
        }
      } else {
        // Reset all limits for user
        for (const type of Object.keys(TIER_RATE_LIMITS.free)) {
          const key = `${type}:${userId}`;
          if (this.useRedis && this.redis) {
            await this.redis.del(key);
          } else {
            this.memoryStore.delete(key);
          }
        }
      }

      logger.info('Rate limit reset', { userId, limitType });
    } catch (error) {
      logger.error('Failed to reset rate limit', { error, userId, limitType });
    }
  }

  /**
   * Clean up expired entries in memory store
   */
  private startMemoryCleanup(): void {
    setInterval(() => {
      const now = Date.now();
      for (const [key, value] of this.memoryStore.entries()) {
        if (value.resetTime < now) {
          this.memoryStore.delete(key);
        }
      }
    }, 60000); // Cleanup every minute
  }

  /**
   * Get Redis connection status
   */
  getConnectionStatus(): { usingRedis: boolean; connected: boolean; error?: string } {
    return {
      usingRedis: this.useRedis,
      connected: this.redis?.status === 'ready',
      error: this.redis?.status === 'end' ? 'Redis connection ended' : undefined,
    };
  }

  /**
   * Close Redis connection
   */
  async close(): Promise<void> {
    if (this.redis) {
      await this.redis.quit();
    }
  }
}

// Factory function to create rate limiters
export function createRateLimiter(
  rateLimitService: RateLimitService,
  limitType: keyof TierRateLimits['free'],
  options?: Partial<RateLimitConfig>
) {
  return rateLimitService.createTieredRateLimiter(limitType, options);
}
