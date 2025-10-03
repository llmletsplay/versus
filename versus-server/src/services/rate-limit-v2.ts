/**
 * Improved Rate Limiting Service
 * Uses token bucket algorithm with better performance
 */

import Redis from 'ioredis';
import { logger } from '../utils/logger.js';
import type { Context, Next } from 'hono';
import type { SubscriptionFeatures } from '../config/subscription-tiers.js';

export interface TokenBucketConfig {
  // Rate in tokens per second
  rate: number;
  // Maximum bucket size
  burst: number;
  // Cost per request (default: 1)
  cost?: number;
}

export interface RateLimitResult {
  allowed: boolean;
  tokensRemaining: number;
  resetTime: number;
  retryAfter?: number;
}

export class TokenBucketRateLimiter {
  private redis?: Redis;
  private useRedis: boolean;
  private keyPrefix: string;

  constructor(redisUrl?: string, keyPrefix: string = 'rate_limit:') {
    this.keyPrefix = keyPrefix;
    this.useRedis = !!redisUrl;

    if (redisUrl) {
      this.redis = new Redis(redisUrl, {
        retryDelayOnFailover: 100,
        maxRetriesPerRequest: 3,
        lazyConnect: true,
        commandTimeout: 1000,
        maxRetriesPerRequest: 3,
      });

      this.redis.on('error', (error) => {
        logger.error('Redis connection error', { error });
        // Continue with memory store as fallback
      });
    }
  }

  /**
   * Check rate limit using token bucket algorithm
   */
  async checkLimit(key: string, config: TokenBucketConfig): Promise<RateLimitResult> {
    const now = Math.floor(Date.now() / 1000);
    const cost = config.cost || 1;

    if (this.redis && this.useRedis) {
      return await this.checkRedisLimit(key, config, now, cost);
    } else {
      return await this.checkMemoryLimit(key, config, now, cost);
    }
  }

  /**
   * Redis-based token bucket using Lua script for atomicity
   */
  private async checkRedisLimit(
    key: string,
    config: TokenBucketConfig,
    now: number,
    cost: number
  ): Promise<RateLimitResult> {
    const redisKey = this.keyPrefix + key;

    // Lua script for atomic token bucket operations
    const luaScript = `
      local key = KEYS[1]
      local now = tonumber(ARGV[1])
      local rate = tonumber(ARGV[2])
      local burst = tonumber(ARGV[3])
      local cost = tonumber(ARGV[4])

      local bucket = redis.call('HMGET', key, 'tokens', 'last_refill')
      local tokens = tonumber(bucket[1]) or burst
      local lastRefill = tonumber(bucket[2]) or now

      -- Calculate tokens to add based on time elapsed
      local elapsed = now - lastRefill
      local tokensToAdd = math.floor(elapsed * rate)
      tokens = math.min(burst, tokens + tokensToAdd)

      -- Check if request can be processed
      if tokens >= cost then
        tokens = tokens - cost
        local success = 1
      else
        local success = 0
      end

      -- Update bucket
      redis.call('HMSET', key, 'tokens', tokens, 'last_refill', now)
      redis.call('EXPIRE', key, math.ceil(burst / rate) + 60)

      return {success, tokens, now}
    `;

    try {
      const result = (await this.redis.eval(
        luaScript,
        1,
        redisKey,
        now,
        config.rate,
        config.burst,
        cost
      )) as number[];

      const allowed = result[0] === 1;
      const tokensRemaining = result[1];
      const resetTime = result[2];

      return {
        allowed,
        tokensRemaining,
        resetTime: resetTime * 1000,
        retryAfter: allowed ? undefined : Math.ceil(cost / config.rate),
      };
    } catch (error) {
      logger.error('Redis rate limit check failed', { error, key });
      // Fallback to memory store
      return this.checkMemoryLimit(key, config, now, cost);
    }
  }

  /**
   * In-memory token bucket for fallback
   */
  private async checkMemoryLimit(
    key: string,
    config: TokenBucketConfig,
    now: number,
    cost: number
  ): Promise<RateLimitResult> {
    // This would need a persistent store in production
    // For now, using a simple approach
    const tokens = Math.max(0, config.burst - cost);

    return {
      allowed: tokens >= 0,
      tokensRemaining: tokens,
      resetTime: now + 60,
    };
  }

  /**
   * Reset rate limit for a key
   */
  async reset(key: string): Promise<void> {
    if (this.redis && this.useRedis) {
      await this.redis.del(this.keyPrefix + key);
    }
  }

  /**
   * Get current bucket state
   */
  async getBucketState(key: string): Promise<{ tokens: number; lastRefill: number } | null> {
    if (this.redis && this.useRedis) {
      const result = await this.redis.hmget(this.keyPrefix + key, 'tokens', 'last_refill');
      if (result[0]) {
        return {
          tokens: parseFloat(result[0]),
          lastRefill: parseFloat(result[1] || '0'),
        };
      }
    }
    return null;
  }
}

/**
 * Rate limit configurations based on subscription tiers
 */
export const RATE_LIMIT_CONFIGS = {
  // API endpoints - requests per minute
  api: {
    free: { rate: 100 / 60, burst: 10 }, // ~100 RPM, burst of 10
    basic: { rate: 1000 / 60, burst: 50 }, // ~1000 RPM, burst of 50
    pro: { rate: 10000 / 60, burst: 200 }, // ~10k RPM, burst of 200
    enterprise: { rate: -1, burst: -1 }, // Unlimited
  },
  // Authentication attempts - per minute
  auth: {
    free: { rate: 5 / 60, burst: 1 },
    basic: { rate: 10 / 60, burst: 2 },
    pro: { rate: 20 / 60, burst: 5 },
    enterprise: { rate: -1, burst: -1 },
  },
  // Game creation - per minute
  gameCreation: {
    free: { rate: 10 / 60, burst: 2 },
    basic: { rate: 100 / 60, burst: 10 },
    pro: { rate: 1000 / 60, burst: 50 },
    enterprise: { rate: -1, burst: -1 },
  },
  // File uploads - per minute
  uploads: {
    free: { rate: 5 / 60, burst: 1 },
    basic: { rate: 50 / 60, burst: 5 },
    pro: { rate: 500 / 60, burst: 50 },
    enterprise: { rate: -1, burst: -1 },
  },
  // WebSocket messages - per second
  websocket: {
    free: { rate: 10, burst: 5 },
    basic: { rate: 30, burst: 10 },
    pro: { rate: 100, burst: 50 },
    enterprise: { rate: -1, burst: -1 },
  },
} as const;

/**
 * Create rate limiting middleware
 */
export function createRateLimitMiddleware(
  limiter: TokenBucketRateLimiter,
  type: keyof typeof RATE_LIMIT_CONFIGS,
  getTier: (c: Context) => Promise<string>
) {
  return async (c: Context, next: Next) => {
    const tier = await getTier(c);
    const config = RATE_LIMIT_CONFIGS[type][tier];

    // Unlimited access
    if (config.rate === -1) {
      await next();
      return;
    }

    // Generate key based on user ID or IP
    const userId = c.get('user')?.userId;
    const ip = c.req.header('x-forwarded-for') || c.req.header('x-real-ip') || 'unknown';
    const key = `${type}:${userId || ip}`;

    // Check rate limit
    const result = await limiter.checkLimit(key, config);

    // Add rate limit headers
    c.res.headers.set('X-RateLimit-Limit', Math.ceil(config.rate * 60).toString());
    c.res.headers.set('X-RateLimit-Remaining', Math.floor(result.tokensRemaining).toString());
    c.res.headers.set('X-RateLimit-Reset', result.resetTime.toString());

    if (!result.allowed) {
      c.res.headers.set('Retry-After', (result.retryAfter || 60).toString());
      c.status(429).json({
        success: false,
        error: 'Too many requests',
        code: 'RATE_LIMIT_EXCEEDED',
        retryAfter: result.retryAfter,
      });
      return;
    }

    await next();
  };
}
