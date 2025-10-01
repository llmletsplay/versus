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
   * List all available game types (raw array for client compatibility)
   */
  app.get('/', async c => {
    try {
      const gameTypes = gameManager.getAvailableGameTypes();
      return c.json(gameTypes);
    } catch (error) {
      logger.error('Error getting game metadata', { error });
      return c.json(
        {
          success: false,
          error: 'Failed to list game types',
          code: 'GAME_TYPES_ERROR',
        },
        500
      );
    }
  });

  /**
   * GET /metadata
   * Return metadata for all games (Record<string, GameMetadata>)
   */
  app.get('/metadata', async c => {
    try {
      const metadata = await gameManager.getAllGameMetadata();
      return c.json({ success: true, data: metadata });
    } catch (error) {
      logger.error('Error getting game metadata', { error });
      return c.json({ success: false, error: 'Failed to get game metadata', code: 'METADATA_ERROR' }, 500);
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
   * GET /:gameType/metadata
   * Get metadata for specific game type
   */
  app.get('/:gameType/metadata', async c => {
    try {
      const gameType = c.req.param('gameType');
      const metadata = await gameManager.getGameMetadata(gameType);
      if (!metadata) {
        return c.json({ success: false, error: `Game type not found: ${gameType}` , code: 'UNKNOWN_GAME_TYPE'}, 404);
      }
      return c.json({ success: true, data: metadata });
    } catch (error) {
      logger.error('Error getting game metadata by type', { gameType: c.req.param('gameType'), error });
      return c.json({ success: false, error: 'Failed to get game metadata', code: 'METADATA_ERROR' }, 500);
    }
  });

  /**
   * GET /:gameType/rules
   * Return markdown rules for the game type
   */
  app.get('/:gameType/rules', async c => {
    try {
      const gameType = c.req.param('gameType');
      const rules = await gameManager.getGameRules(gameType);
      if (!rules) {
        return c.json({ success: false, error: `Rules not found for game type: ${gameType}`, code: 'RULES_NOT_FOUND' }, 404);
      }
      return c.json({ success: true, data: { gameType, rules } });
    } catch (error) {
      logger.error('Error getting game rules', { gameType: c.req.param('gameType'), error });
      return c.json({ success: false, error: 'Failed to load game rules', code: 'RULES_ERROR' }, 500);
    }
  });

  /**
   * GET /:gameType/:gameId/history
   * Get game history (moves array)
   */
  app.get('/:gameType/:gameId/history', async c => {
    try {
      const { gameType, gameId } = { gameType: c.req.param('gameType'), gameId: c.req.param('gameId') };
      const history = await gameManager.getGameHistory(gameType, gameId);
      return c.json({ success: true, data: history });
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Error';
      if (message.includes('Game not found')) {
        return c.json({ success: false, error: message, code: 'GAME_NOT_FOUND' }, 404);
      }
      logger.error('Error getting game history', { gameId: c.req.param('gameId'), error });
      return c.json({ success: false, error: 'Failed to get game history', code: 'HISTORY_ERROR' }, 500);
    }
  });

  /**
   * POST /:gameType/:gameId/validate
   * Validate a move without applying it
   */
  app.post('/:gameType/:gameId/validate', zValidator('json', moveDataSchema), async c => {
    try {
      const { gameType, gameId } = { gameType: c.req.param('gameType'), gameId: c.req.param('gameId') };
      const moveData = c.req.valid('json');
      const game = await gameManager.getGame(gameType, gameId);
      const validation = await (game as any).validateMove(moveData);
      return c.json({ success: true, data: validation });
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Error';
      if (message.includes('Game not found')) {
        return c.json({ success: false, error: message, code: 'GAME_NOT_FOUND' }, 404);
      }
      logger.error('Error validating move', { gameId: c.req.param('gameId'), error });
      return c.json({ success: false, error: 'Failed to validate move', code: 'VALIDATION_ERROR' }, 500);
    }
  });

  /**
   * POST /:gameType/:gameId/restore
   * Restore game state from a provided history
   */
  app.post('/:gameType/:gameId/restore', zValidator('json', z.object({ history: z.array(z.any()) })), async c => {
    try {
      const { gameType, gameId } = { gameType: c.req.param('gameType'), gameId: c.req.param('gameId') };
      const { history } = c.req.valid('json') as { history: any[] };
      await gameManager.restoreGame(gameType, gameId, history as any);
      return c.json({ success: true, data: { status: 'restored' } });
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Error';
      if (message.includes('Game not found')) {
        return c.json({ success: false, error: message, code: 'GAME_NOT_FOUND' }, 404);
      }
      logger.error('Error restoring game', { gameId: c.req.param('gameId'), error });
      return c.json({ success: false, error: 'Failed to restore game', code: 'RESTORE_ERROR' }, 500);
    }
  });

  /**
   * DELETE /:gameId
   * Delete a game by id
   */
  app.delete('/:gameId', async c => {
    try {
      const gameId = c.req.param('gameId');
      await gameManager.deleteGame(gameId);
      return c.json({ success: true, data: { status: 'deleted' } });
    } catch (error) {
      logger.error('Error deleting game', { gameId: c.req.param('gameId'), error });
      return c.json({ success: false, error: 'Failed to delete game', code: 'DELETE_ERROR' }, 500);
    }
  });

  return app;
}
