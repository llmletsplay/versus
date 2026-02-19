import { Hono } from 'hono';
import { zValidator } from '@hono/zod-validator';
import { z } from 'zod';
import type { RatingService } from '../services/rating-service.js';
import { logger } from '../utils/logger.js';

const leaderboardQuerySchema = z.object({
  gameType: z.string().min(1),
  limit: z.coerce.number().min(1).max(100).optional(),
  offset: z.coerce.number().min(0).optional(),
  includeAgents: z.coerce.boolean().optional(),
});

export function createRatingRoutes(ratingService: RatingService) {
  const app = new Hono();

  /**
   * GET /leaderboard
   * Get leaderboard for a game type
   */
  app.get('/leaderboard', zValidator('query', leaderboardQuerySchema), async (c) => {
    try {
      const query = c.req.valid('query');
      const leaderboard = await ratingService.getLeaderboard({
        gameType: query.gameType,
        limit: query.limit,
        offset: query.offset,
        includeAgents: query.includeAgents,
      });

      return c.json({ success: true, data: leaderboard });
    } catch (error) {
      logger.error('Error fetching leaderboard', { error });
      return c.json(
        { success: false, error: 'Failed to fetch leaderboard', code: 'LEADERBOARD_ERROR' },
        500
      );
    }
  });

  /**
   * GET /user/:userId
   * Get all ratings for a specific user
   */
  app.get('/user/:userId', async (c) => {
    try {
      const userId = c.req.param('userId');
      const ratings = await ratingService.getUserRatings(userId);
      return c.json({ success: true, data: ratings });
    } catch (error) {
      logger.error('Error fetching user ratings', { error });
      return c.json(
        { success: false, error: 'Failed to fetch user ratings', code: 'RATING_ERROR' },
        500
      );
    }
  });

  /**
   * GET /user/:userId/:gameType
   * Get a specific user's rating for a game type
   */
  app.get('/user/:userId/:gameType', async (c) => {
    try {
      const userId = c.req.param('userId');
      const gameType = c.req.param('gameType');
      const rating = await ratingService.getPlayerRating(userId, gameType);
      return c.json({ success: true, data: rating });
    } catch (error) {
      logger.error('Error fetching player rating', { error });
      return c.json(
        { success: false, error: 'Failed to fetch player rating', code: 'RATING_ERROR' },
        500
      );
    }
  });

  return app;
}
