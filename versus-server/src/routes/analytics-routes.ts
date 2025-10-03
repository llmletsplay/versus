import { Hono } from 'hono';
import { zValidator } from '@hono/zod-validator';
import { z } from 'zod';
import { AnalyticsService } from '../services/analytics-service.js';
import { RateLimitService, createRateLimiter } from '../services/rate-limit-service.js';
import { logger } from '../utils/logger.js';
import type { Variables } from '../types.js';

const trackEventSchema = z.object({
  sessionId: z.string(),
  eventType: z.string(),
  eventName: z.string(),
  properties: z.record(z.any()).optional(),
});

const trackGameSchema = z.object({
  gameId: z.string(),
  gameType: z.string(),
  opponentId: z.string().optional(),
  movesCount: z.number(),
  duration: z.number(),
  result: z.enum(['win', 'lose', 'draw', 'abandoned']),
  isRanked: z.boolean().default(false),
});

const reportRequestSchema = z.object({
  type: z.enum(['user', 'game', 'platform', 'api']),
  params: z.record(z.any()).optional(),
});

export function createAnalyticsRoutes(
  analyticsService: AnalyticsService,
  rateLimitService: RateLimitService
) {
  const app = new Hono<{ Variables: Variables }>();

  /**
   * POST /track/event
   * Track custom analytics event
   */
  app.post(
    '/track/event',
    createRateLimiter(rateLimitService, 'api'),
    zValidator('json', trackEventSchema),
    async (c) => {
      const user = c.get('user');
      try {
        const { sessionId, eventType, eventName, properties } = c.req.valid('json');

        analyticsService.track({
          userId: user?.userId,
          sessionId,
          eventType,
          eventName,
          properties,
          userAgent: c.req.header('user-agent'),
          ip: c.req.header('x-forwarded-for') || c.req.header('x-real-ip'),
          referrer: c.req.header('referrer'),
        });

        return c.json({
          success: true,
          message: 'Event tracked',
        });
      } catch (error) {
        logger.error('Failed to track event', { error });
        return c.json(
          {
            success: false,
            error: 'Failed to track event',
            code: 'TRACK_ERROR',
          },
          500
        );
      }
    }
  );

  /**
   * POST /track/game
   * Track game completion
   */
  app.post(
    '/track/game',
    createRateLimiter(rateLimitService, 'api'),
    zValidator('json', trackGameSchema),
    async (c) => {
      const user = c.get('user');
      if (!user) {
        return c.json(
          {
            success: false,
            error: 'Authentication required',
            code: 'NO_AUTH',
          },
          401
        );
      }

      try {
        const gameData = c.req.valid('json');

        await analyticsService.trackGame({
          ...gameData,
          userId: user.userId,
        });

        return c.json({
          success: true,
          message: 'Game tracked',
        });
      } catch (error) {
        logger.error('Failed to track game', { error });
        return c.json(
          {
            success: false,
            error: 'Failed to track game',
            code: 'TRACK_ERROR',
          },
          500
        );
      }
    }
  );

  /**
   * GET /user/metrics
   * Get user's performance metrics
   */
  app.get('/user/metrics', async (c) => {
    const user = c.get('user');
    if (!user) {
      return c.json(
        {
          success: false,
          error: 'Authentication required',
          code: 'NO_AUTH',
        },
        401
      );
    }

    try {
      const metrics = await analyticsService.getUserMetrics(user.userId);

      if (!metrics) {
        return c.json({
          success: true,
          data: {
            userId: user.userId,
            totalGames: 0,
            totalWins: 0,
            totalLosses: 0,
            totalDraws: 0,
            favoriteGameType: null,
            averageGameDuration: 0,
            winRate: 0,
            lastActive: null,
            totalPlayTime: 0,
          },
        });
      }

      return c.json({
        success: true,
        data: metrics,
      });
    } catch (error) {
      logger.error('Failed to get user metrics', { error });
      return c.json(
        {
          success: false,
          error: 'Failed to get metrics',
          code: 'METRICS_ERROR',
        },
        500
      );
    }
  });

  /**
   * GET /user/history
   * Get user's recent game history
   */
  app.get('/user/history', async (c) => {
    const user = c.get('user');
    if (!user) {
      return c.json(
        {
          success: false,
          error: 'Authentication required',
          code: 'NO_AUTH',
        },
        401
      );
    }

    try {
      const limit = parseInt(c.req.query('limit') || '20');
      const offset = parseInt(c.req.query('offset') || '0');

      const history = await c.get('db').all(
        `
        SELECT
          game_id,
          game_type,
          opponent_id,
          moves_count,
          duration,
          result,
          is_ranked,
          created_at
        FROM game_analytics
        WHERE user_id = $1
        ORDER BY created_at DESC
        LIMIT $2 OFFSET $3
      `,
        [user.userId, limit, offset]
      );

      return c.json({
        success: true,
        data: {
          games: history,
          pagination: {
            limit,
            offset,
            hasMore: history.length === limit,
          },
        },
      });
    } catch (error) {
      logger.error('Failed to get game history', { error });
      return c.json(
        {
          success: false,
          error: 'Failed to get history',
          code: 'HISTORY_ERROR',
        },
        500
      );
    }
  });

  /**
   * GET /games/stats
   * Get game statistics
   */
  app.get('/games/stats', async (c) => {
    try {
      const gameType = c.req.query('gameType') as string;
      const timeRange = parseInt(c.req.query('timeRange') || '30');

      const stats = await analyticsService.getGameStats(gameType, timeRange);

      return c.json({
        success: true,
        data: stats,
      });
    } catch (error) {
      logger.error('Failed to get game stats', { error });
      return c.json(
        {
          success: false,
          error: 'Failed to get game stats',
          code: 'STATS_ERROR',
        },
        500
      );
    }
  });

  /**
   * GET /platform
   * Get platform analytics (admin only)
   */
  app.get('/platform', async (c) => {
    const user = c.get('user');
    if (!user || user.role !== 'admin') {
      return c.json(
        {
          success: false,
          error: 'Admin access required',
          code: 'ADMIN_REQUIRED',
        },
        403
      );
    }

    try {
      const timeRange = parseInt(c.req.query('timeRange') || '30');
      const analytics = await analyticsService.getPlatformAnalytics(timeRange);

      return c.json({
        success: true,
        data: analytics,
      });
    } catch (error) {
      logger.error('Failed to get platform analytics', { error });
      return c.json(
        {
          success: false,
          error: 'Failed to get platform analytics',
          code: 'PLATFORM_ERROR',
        },
        500
      );
    }
  });

  /**
   * GET /api/usage
   * Get API usage statistics
   */
  app.get('/api/usage', async (c) => {
    const user = c.get('user');
    try {
      const timeRange = parseInt(c.req.query('timeRange') || '30');

      // Users can only see their own usage
      const userId = user?.role === 'admin' ? (c.req.query('userId') as string) : user?.userId;

      const stats = await analyticsService.getApiUsageStats(userId, timeRange);

      // Get current rate limit status
      const rateLimitStats = await rateLimitService.getUsageStats(userId);

      return c.json({
        success: true,
        data: {
          usage: stats,
          rateLimits: rateLimitStats,
          connection: rateLimitService.getConnectionStatus(),
        },
      });
    } catch (error) {
      logger.error('Failed to get API usage', { error });
      return c.json(
        {
          success: false,
          error: 'Failed to get API usage',
          code: 'USAGE_ERROR',
        },
        500
      );
    }
  });

  /**
   * POST /report
   * Generate custom report
   */
  app.post(
    '/report',
    createRateLimiter(rateLimitService, 'api'),
    zValidator('json', reportRequestSchema),
    async (c) => {
      const user = c.get('user');
      if (!user) {
        return c.json(
          {
            success: false,
            error: 'Authentication required',
            code: 'NO_AUTH',
          },
          401
        );
      }

      try {
        const { type, params } = c.req.valid('json');

        // Check permissions
        if (type === 'platform' && user.role !== 'admin') {
          return c.json(
            {
              success: false,
              error: 'Admin access required',
              code: 'ADMIN_REQUIRED',
            },
            403
          );
        }

        // Add userId to params for user reports
        if (type === 'user' || type === 'api') {
          params.userId = params.userId || user.userId;
        }

        const report = await analyticsService.createReport(type, params);

        return c.json({
          success: true,
          data: report,
        });
      } catch (error) {
        logger.error('Failed to generate report', { error });
        return c.json(
          {
            success: false,
            error: 'Failed to generate report',
            code: 'REPORT_ERROR',
          },
          500
        );
      }
    }
  );

  /**
   * GET /leaderboard
   * Get game leaderboard
   */
  app.get('/leaderboard', async (c) => {
    try {
      const gameType = c.req.query('gameType') as string;
      const timeRange = parseInt(c.req.query('timeRange') || '30');
      const limit = parseInt(c.req.query('limit') || '50');

      const leaderboard = await c.get('db').all(
        `
        WITH user_stats AS (
          SELECT
            u.id as user_id,
            u.username,
            COUNT(ga.id) as total_games,
            COUNT(CASE WHEN ga.result = 'win' THEN 1 END) as wins,
            COUNT(CASE WHEN ga.result = 'lose' THEN 1 END) as losses,
            COUNT(CASE WHEN ga.result = 'draw' THEN 1 END) as draws,
            AVG(ga.duration) as avg_duration,
            SUM(ga.duration) as total_playtime
          FROM users u
          LEFT JOIN game_analytics ga ON u.id = ga.user_id
          ${gameType ? 'WHERE ga.game_type = $1' : ''}
          AND ga.created_at > $${gameType ? 2 : 1}
          GROUP BY u.id, u.username
          HAVING COUNT(ga.id) >= 5
        )
        SELECT
          user_id,
          username,
          total_games,
          wins,
          losses,
          draws,
          ROUND((wins::float / total_games) * 100, 2) as win_rate,
          ROUND(avg_duration) as avg_duration,
          RANK() OVER (ORDER BY (wins::float / total_games) DESC, total_games DESC) as rank
        FROM user_stats
        ORDER BY win_rate DESC, total_games DESC
        LIMIT $${gameType ? 3 : 2}
      `,
        gameType
          ? [gameType, Date.now() - timeRange * 24 * 60 * 60 * 1000, limit]
          : [Date.now() - timeRange * 24 * 60 * 60 * 1000, limit]
      );

      return c.json({
        success: true,
        data: {
          leaderboard,
          gameType,
          timeRange,
        },
      });
    } catch (error) {
      logger.error('Failed to get leaderboard', { error });
      return c.json(
        {
          success: false,
          error: 'Failed to get leaderboard',
          code: 'LEADERBOARD_ERROR',
        },
        500
      );
    }
  });

  /**
   * DELETE /reset-rate-limit (admin only)
   * Reset rate limit for a user
   */
  app.delete('/reset-rate-limit', async (c) => {
    const user = c.get('user');
    if (!user || user.role !== 'admin') {
      return c.json(
        {
          success: false,
          error: 'Admin access required',
          code: 'ADMIN_REQUIRED',
        },
        403
      );
    }

    try {
      const userId = c.req.query('userId') as string;
      const limitType = c.req.query('type') as string;

      if (!userId) {
        return c.json(
          {
            success: false,
            error: 'User ID required',
            code: 'MISSING_USER_ID',
          },
          400
        );
      }

      await rateLimitService.resetRateLimit(userId, limitType as any);

      return c.json({
        success: true,
        message: `Rate limit reset for user ${userId}`,
      });
    } catch (error) {
      logger.error('Failed to reset rate limit', { error });
      return c.json(
        {
          success: false,
          error: 'Failed to reset rate limit',
          code: 'RESET_ERROR',
        },
        500
      );
    }
  });

  return app;
}
