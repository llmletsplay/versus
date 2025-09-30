import { Hono } from 'hono';
import { zValidator } from '@hono/zod-validator';
import { z } from 'zod';
import { GameManager } from '../core/game-manager.js';
import { logger } from '../utils/logger.js';

// Validation schemas
const moveDataSchema = z
  .object({
    player: z.string().optional(),
    moveData: z.record(z.any()).optional(),
  })
  .passthrough();

const createGameSchema = z.object({
  config: z
    .object({
      maxPlayers: z.number().optional(),
      minPlayers: z.number().optional(),
      timeLimit: z.number().optional(),
    })
    .optional(),
});

export function createGameRoutes(gameManager: GameManager) {
  const app = new Hono();

  /**
   * GET /
   * List all available game types
   */
  app.get('/', async c => {
    try {
      const metadata = await gameManager.getAllGameMetadata();
      return c.json({
        success: true,
        data: metadata,
        message: 'Available games retrieved successfully',
      });
    } catch (error) {
      logger.error('Error getting game metadata', { error });
      return c.json(
        {
          success: false,
          error: 'Failed to get game types',
          code: 'METADATA_ERROR',
        },
        500
      );
    }
  });

  /**
   * POST /:gameType/new
   * Create a new game of the specified type
   */
  app.post('/:gameType/new', zValidator('json', createGameSchema), async c => {
    try {
      const gameType = c.req.param('gameType');
      const { config } = c.req.valid('json');

      const gameId = await gameManager.createGame(gameType, config);

      logger.info('Game created', { gameId, gameType });

      return c.json(
        {
          success: true,
          data: { gameId },
          message: 'Game created successfully',
        },
        201
      );
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Failed to create game';
      logger.error('Error creating game', { error: message, gameType: c.req.param('gameType') });

      if (message.includes('Unknown game type')) {
        return c.json(
          {
            success: false,
            error: message,
            code: 'UNKNOWN_GAME_TYPE',
          },
          400
        );
      }

      return c.json(
        {
          success: false,
          error: 'Failed to create game',
          code: 'GAME_CREATION_ERROR',
        },
        500
      );
    }
  });

  /**
   * GET /:gameType/:gameId/state
   * Get current game state
   */
  app.get('/:gameType/:gameId/state', async c => {
    try {
      const gameId = c.req.param('gameId');
      const gameType = c.req.param('gameType');
      const game = await gameManager.getGame(gameType, gameId);

      if (!game) {
        return c.json(
          {
            success: false,
            error: 'Game not found',
            code: 'GAME_NOT_FOUND',
          },
          404
        );
      }

      const gameState = await game.getGameState();
      return c.json({
        success: true,
        data: gameState,
      });
    } catch (error) {
      logger.error('Error getting game state', { gameId: c.req.param('gameId'), error });
      return c.json(
        {
          success: false,
          error: 'Failed to get game state',
          code: 'STATE_ERROR',
        },
        500
      );
    }
  });

  /**
   * POST /:gameType/:gameId/move
   * Make a move in the game
   */
  app.post('/:gameType/:gameId/move', zValidator('json', moveDataSchema), async c => {
    try {
      const gameId = c.req.param('gameId');
      const gameType = c.req.param('gameType');
      const game = await gameManager.getGame(gameType, gameId);

      if (!game) {
        return c.json(
          {
            success: false,
            error: 'Game not found',
            code: 'GAME_NOT_FOUND',
          },
          404
        );
      }

      const moveData = c.req.valid('json');
      const result = await gameManager.makeMove(gameType, gameId, moveData);

      logger.info('Move made', { gameId, moveData });

      return c.json({
        success: true,
        data: result,
        message: 'Move processed successfully',
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Move failed';
      logger.error('Error making move', { gameId: c.req.param('gameId'), error: message });

      if (message.includes('Invalid move') || message.includes('not your turn')) {
        return c.json(
          {
            success: false,
            error: message,
            code: 'INVALID_MOVE',
          },
          400
        );
      }

      return c.json(
        {
          success: false,
          error: 'Failed to process move',
          code: 'MOVE_ERROR',
        },
        500
      );
    }
  });

  /**
   * GET /:gameType/:gameId/metadata
   * Get game metadata including rules and configuration
   */
  app.get('/:gameType/:gameId/metadata', async c => {
    try {
      const gameType = c.req.param('gameType');
      const gameId = c.req.param('gameId');

      const game = await gameManager.getGame(gameType, gameId);
      if (!game) {
        return c.json(
          {
            success: false,
            error: 'Game not found',
            code: 'GAME_NOT_FOUND',
          },
          404
        );
      }

      const metadata = await game.getMetadata();
      return c.json({
        success: true,
        data: metadata,
      });
    } catch (error) {
      logger.error('Error getting game metadata', { gameId: c.req.param('gameId'), error });
      return c.json(
        {
          success: false,
          error: 'Failed to get game metadata',
          code: 'METADATA_ERROR',
        },
        500
      );
    }
  });

  return app;
}
