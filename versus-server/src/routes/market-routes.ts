import { Hono } from 'hono';
import { zValidator } from '@hono/zod-validator';
import { z } from 'zod';
import type { PredictionMarketService } from '../services/prediction-market-service.js';
import { logger } from '../utils/logger.js';
import { requireAuth, getAuthUserId } from '../middleware/auth.js';

const createMarketSchema = z.object({
  marketType: z.enum(['match_outcome', 'tournament_winner', 'in_game_prop', 'agent_vs_agent']),
  roomId: z.string().optional(),
  tournamentId: z.string().optional(),
  question: z.string().min(1),
  outcomes: z.array(z.string().min(1)).min(2).max(20),
  closesAt: z.number().positive(),
  token: z.string().optional(),
});

const placeBetSchema = z.object({
  outcomeIndex: z.number().int().min(0),
  amount: z.number().positive(),
});

export function createMarketRoutes(marketService: PredictionMarketService) {
  const app = new Hono();

  /** POST / — Create a new prediction market */
  app.post('/', zValidator('json', createMarketSchema), async (c) => {
    try {
      const body = c.req.valid('json');
      const market = await marketService.createMarket(body);
      return c.json({ success: true, data: market }, 201);
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Failed to create market';
      logger.error('Error creating market', { error: message });
      return c.json({ success: false, error: message, code: 'MARKET_CREATE_ERROR' }, 500);
    }
  });

  /** GET / — List open markets */
  app.get('/', async (c) => {
    try {
      const status = c.req.query('status') as any;
      const markets = await marketService.listMarkets(status || undefined);
      return c.json({ success: true, data: markets });
    } catch (error) {
      logger.error('Error listing markets', { error });
      return c.json(
        { success: false, error: 'Failed to list markets', code: 'MARKET_LIST_ERROR' },
        500
      );
    }
  });

  /** GET /:marketId — Get market details */
  app.get('/:marketId', async (c) => {
    try {
      const marketId = c.req.param('marketId');
      const market = await marketService.getMarket(marketId);
      if (!market) {
        return c.json({ success: false, error: 'Market not found', code: 'MARKET_NOT_FOUND' }, 404);
      }
      return c.json({ success: true, data: market });
    } catch (error) {
      logger.error('Error fetching market', { error });
      return c.json({ success: false, error: 'Failed to fetch market', code: 'MARKET_ERROR' }, 500);
    }
  });

  /** GET /:marketId/odds — Get computed market odds */
  app.get('/:marketId/odds', async (c) => {
    try {
      const marketId = c.req.param('marketId');
      const odds = await marketService.getMarketOdds(marketId);
      if (!odds) {
        return c.json({ success: false, error: 'Market not found', code: 'MARKET_NOT_FOUND' }, 404);
      }
      return c.json({ success: true, data: odds });
    } catch (error) {
      logger.error('Error fetching odds', { error });
      return c.json({ success: false, error: 'Failed to fetch odds', code: 'ODDS_ERROR' }, 500);
    }
  });

  /** POST /:marketId/bet — Place a bet (auth required) */
  app.post('/:marketId/bet', requireAuth, zValidator('json', placeBetSchema), async (c) => {
    try {
      const userId = getAuthUserId(c);
      const marketId = c.req.param('marketId');
      const body = c.req.valid('json');
      const position = await marketService.placeBet(userId, {
        marketId,
        ...body,
      });
      return c.json({ success: true, data: position }, 201);
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Bet failed';
      logger.error('Error placing bet', { error: message });
      const statusCode = message.includes('not open') || message.includes('closed') ? 400 : 500;
      return c.json({ success: false, error: message, code: 'BET_ERROR' }, statusCode);
    }
  });

  /** GET /:marketId/positions — Get user's positions in a market (auth required) */
  app.get('/:marketId/positions', requireAuth, async (c) => {
    try {
      const userId = getAuthUserId(c);
      const marketId = c.req.param('marketId');
      const positions = await marketService.getUserPositions(userId, marketId);
      return c.json({ success: true, data: positions });
    } catch (error) {
      logger.error('Error fetching positions', { error });
      return c.json(
        { success: false, error: 'Failed to fetch positions', code: 'POSITION_ERROR' },
        500
      );
    }
  });

  /** POST /:marketId/resolve — Resolve market (admin) */
  app.post('/:marketId/resolve', async (c) => {
    try {
      const marketId = c.req.param('marketId');
      const body = (await c.req.json()) as { winningOutcomeIndex: number };
      if (typeof body.winningOutcomeIndex !== 'number') {
        return c.json(
          { success: false, error: 'winningOutcomeIndex required', code: 'VALIDATION_ERROR' },
          400
        );
      }

      await marketService.resolveMarket(marketId, body.winningOutcomeIndex);
      return c.json({ success: true, data: { status: 'resolved' } });
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Resolution failed';
      logger.error('Error resolving market', { error: message });
      return c.json({ success: false, error: message, code: 'RESOLVE_ERROR' }, 500);
    }
  });

  /** POST /:marketId/cancel — Cancel market and refund */
  app.post('/:marketId/cancel', async (c) => {
    try {
      const marketId = c.req.param('marketId');
      await marketService.cancelMarket(marketId);
      return c.json({ success: true, data: { status: 'cancelled' } });
    } catch (error) {
      logger.error('Error cancelling market', { error });
      return c.json(
        { success: false, error: 'Failed to cancel market', code: 'CANCEL_ERROR' },
        500
      );
    }
  });

  /** GET /room/:roomId — Get market for a specific room */
  app.get('/room/:roomId', async (c) => {
    try {
      const roomId = c.req.param('roomId');
      const market = await marketService.getMarketByRoom(roomId);
      if (!market) {
        return c.json(
          { success: false, error: 'No market for room', code: 'MARKET_NOT_FOUND' },
          404
        );
      }
      return c.json({ success: true, data: market });
    } catch (error) {
      logger.error('Error fetching room market', { error });
      return c.json({ success: false, error: 'Failed to fetch market', code: 'MARKET_ERROR' }, 500);
    }
  });

  return app;
}
