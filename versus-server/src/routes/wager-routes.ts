import { Hono } from 'hono';
import { zValidator } from '@hono/zod-validator';
import { z } from 'zod';
import type { WagerService } from '../services/wager-service.js';
import type { IntentService } from '../services/intent-service.js';
import type { X402PaymentService } from '../services/x402-payment-service.js';
import { logger } from '../utils/logger.js';
import { requireAuth, getAuthUserId } from '../middleware/auth.js';

interface X402RouteConfig {
  enabled: boolean;
  settlementAddress?: string;
}

const createWagerSchema = z.object({
  gameType: z.string().min(1),
  stakeAmount: z.string().min(1),
  stakeToken: z.string().default('USDC'),
  stakeChain: z.enum(['base', 'near', 'solana', 'ethereum', 'arbitrum']).default('base'),
  playerAAddress: z.string().min(1),
  playerAAgentId: z.string().optional(),
  playerBAddress: z.string().optional(),
  playerBAgentId: z.string().optional(),
  options: z
    .object({
      isRanked: z.boolean().optional(),
      timeControl: z.string().optional(),
      marketEnabled: z.boolean().optional(),
    })
    .optional(),
});

const commitStakeSchema = z.object({
  walletAddress: z.string().min(1),
  amount: z.string().min(1),
  signature: z.string().min(1),
});

const settleWagerSchema = z.object({
  winnerId: z.string().min(1),
  winnerAddress: z.string().min(1),
  loserId: z.string().min(1),
  loserAddress: z.string().min(1),
});

export function createWagerRoutes(
  wagerService: WagerService,
  intentService: IntentService,
  paymentService: X402PaymentService | null,
  x402Config: X402RouteConfig
) {
  const app = new Hono();

  app.post('/', requireAuth, zValidator('json', createWagerSchema), async (c) => {
    try {
      getAuthUserId(c);
      const body = c.req.valid('json');

      const { wager, paymentInfo } = await wagerService.createWager({
        ...body,
        playerAAddress: body.playerAAddress,
      });

      return c.json(
        {
          success: true,
          data: {
            wager,
            paymentInfo,
          },
        },
        201
      );
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Failed to create wager';
      logger.error('Error creating wager', { error: message });
      return c.json({ success: false, error: message, code: 'WAGER_CREATE_ERROR' }, 500);
    }
  });

  app.get('/', async (c) => {
    try {
      const filters = {
        gameType: c.req.query('gameType'),
        status: c.req.query('status') as any,
        playerId: c.req.query('playerId'),
        minStake: c.req.query('minStake'),
        maxStake: c.req.query('maxStake'),
        limit: c.req.query('limit') ? parseInt(c.req.query('limit')!) : 50,
        offset: c.req.query('offset') ? parseInt(c.req.query('offset')!) : 0,
      };

      const wagers = await wagerService.listWagers(filters);
      return c.json({ success: true, data: wagers });
    } catch (error) {
      logger.error('Error listing wagers', { error });
      return c.json(
        { success: false, error: 'Failed to list wagers', code: 'WAGER_LIST_ERROR' },
        500
      );
    }
  });

  app.get('/:wagerId', async (c) => {
    try {
      const wagerId = c.req.param('wagerId');
      const wager = await wagerService.getWager(wagerId);

      if (!wager) {
        return c.json({ success: false, error: 'Wager not found', code: 'WAGER_NOT_FOUND' }, 404);
      }

      return c.json({ success: true, data: wager });
    } catch (error) {
      logger.error('Error fetching wager', { error });
      return c.json({ success: false, error: 'Failed to fetch wager', code: 'WAGER_ERROR' }, 500);
    }
  });

  app.post('/:wagerId/commit', requireAuth, zValidator('json', commitStakeSchema), async (c) => {
    try {
      const wagerId = c.req.param('wagerId');
      const body = c.req.valid('json');

      const result = await wagerService.commitStake({
        wagerId,
        ...body,
      });

      return c.json({
        success: true,
        data: {
          wager: result.wager,
          intentId: result.intentId,
          bothCommitted: result.wager.status === 'locked',
        },
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Failed to commit stake';
      logger.error('Error committing stake', { error: message });
      return c.json({ success: false, error: message, code: 'COMMIT_ERROR' }, 400);
    }
  });

  app.post('/:wagerId/start', requireAuth, async (c) => {
    try {
      const wagerId = c.req.param('wagerId');
      const body = await c.req.json();
      const gameId = body.gameId;

      if (!gameId) {
        return c.json(
          { success: false, error: 'gameId is required', code: 'VALIDATION_ERROR' },
          400
        );
      }

      const wager = await wagerService.startGame(wagerId, gameId);
      return c.json({ success: true, data: wager });
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Failed to start game';
      logger.error('Error starting wager game', { error: message });
      return c.json({ success: false, error: message, code: 'START_ERROR' }, 400);
    }
  });

  app.post('/:wagerId/settle', requireAuth, zValidator('json', settleWagerSchema), async (c) => {
    try {
      const wagerId = c.req.param('wagerId');
      const body = c.req.valid('json');

      const wager = await wagerService.settleWager({
        wagerId,
        ...body,
      });

      return c.json({ success: true, data: wager });
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Failed to settle wager';
      logger.error('Error settling wager', { error: message });
      return c.json({ success: false, error: message, code: 'SETTLE_ERROR' }, 400);
    }
  });

  app.post('/:wagerId/cancel', requireAuth, async (c) => {
    try {
      const wagerId = c.req.param('wagerId');
      const body = await c.req.json();
      const reason = body.reason ?? 'User requested';

      await wagerService.cancelWager(wagerId, reason);
      return c.json({ success: true, data: { status: 'cancelled' } });
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Failed to cancel wager';
      logger.error('Error cancelling wager', { error: message });
      return c.json({ success: false, error: message, code: 'CANCEL_ERROR' }, 400);
    }
  });

  app.get('/:wagerId/state', async (c) => {
    try {
      const wagerId = c.req.param('wagerId');
      const state = await wagerService.getWagerState(wagerId);

      if (!state) {
        return c.json({ success: false, error: 'Wager not found', code: 'WAGER_NOT_FOUND' }, 404);
      }

      return c.json({ success: true, data: state });
    } catch (error) {
      logger.error('Error fetching wager state', { error });
      return c.json(
        { success: false, error: 'Failed to fetch wager state', code: 'STATE_ERROR' },
        500
      );
    }
  });

  app.get('/:wagerId/intents', async (c) => {
    try {
      const wagerId = c.req.param('wagerId');
      const intents = await intentService.getIntentsByEvent(wagerId);

      return c.json({ success: true, data: intents });
    } catch (error) {
      logger.error('Error fetching wager intents', { error });
      return c.json(
        { success: false, error: 'Failed to fetch intents', code: 'INTENT_ERROR' },
        500
      );
    }
  });

  return app;
}
