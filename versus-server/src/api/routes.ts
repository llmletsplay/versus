import { Router } from 'express';
import { GameManager } from '../core/game-manager.js';
import { z } from 'zod';
import type { Request, Response, NextFunction } from 'express';
import { errorHandler, GameError } from '../utils/error-handler.js';

// API: Validation schemas for request bodies
// SECURITY: Input validation prevents malformed data attacks
const moveDataSchema = z
  .object({
    player: z.string().optional(),
    moveData: z.record(z.any()).optional(),
  })
  .passthrough(); // Allow additional properties

// API: Game restoration schema
const restoreGameSchema = z.object({
  history: z.array(
    z.object({
      player: z.string(),
      moveData: z.record(z.any()),
      timestamp: z.number(),
    })
  ),
});

// API: Game creation schema
const createGameSchema = z.object({
  config: z
    .object({
      maxPlayers: z.number().optional(),
      minPlayers: z.number().optional(),
      timeLimit: z.number().optional(),
      customRules: z.record(z.any()).optional(),
    })
    .optional(),
});

// CRITICAL: Error handling middleware for async routes
// Ensures all errors are properly caught and formatted
const asyncHandler =
  (fn: Function) =>
  (req: Request, res: Response, next: NextFunction): void => {
    Promise.resolve(fn(req, res, next)).catch((error: Error) => {
      if (error instanceof GameError) {
        const statusCode = error.isOperational ? 400 : 500;
        res.status(statusCode).json(errorHandler.createErrorResponse(error));
      } else {
        const gameError = errorHandler.handleError(error);
        res.status(500).json(errorHandler.createErrorResponse(gameError));
      }
    });
  };

// SECURITY: Request body validation middleware
// Prevents malformed data from reaching handlers
const validateBody =
  (schema: z.ZodSchema) =>
  (req: Request, res: Response, next: NextFunction): void => {
    try {
      req.body = schema.parse(req.body);
      next();
    } catch (error) {
      if (error instanceof z.ZodError) {
        res.status(400).json({
          error: 'Validation error',
          details: error.errors,
        });
        return;
      }
      next(error);
    }
  };

// SECURITY: Parameter validation helper
// Ensures required URL parameters are present
const validateParams = (
  params: Record<string, string | undefined>,
  required: string[]
): string | null => {
  for (const param of required) {
    if (!params[param]) {
      return `${param} parameter is required`;
    }
  }
  return null;
};

// CRITICAL: Main API routes factory
// API: All game endpoints are defined here - external contract
export function createGameRoutes(gameManager: GameManager): Router {
  const router = Router();

  // API: GET /v1/games - List all available game types
  // Contract: Returns string array of game types
  router.get(
    '/v1/games',
    asyncHandler(async (req: Request, res: Response): Promise<void> => {
      const gameTypes = gameManager.getAvailableGameTypes();
      res.json(gameTypes);
    })
  );

  // API: GET /v1/games/metadata - Get metadata for all games
  // Contract: Returns Record<string, GameMetadata>
  router.get(
    '/v1/games/metadata',
    asyncHandler(async (req: Request, res: Response): Promise<void> => {
      const metadata = await gameManager.getAllGameMetadata();
      res.json(metadata);
    })
  );

  // API: GET /v1/games/:gameType/metadata - Get metadata for specific game type
  // Contract: Returns GameMetadata | 404 error
  router.get(
    '/v1/games/:gameType/metadata',
    asyncHandler(async (req: Request, res: Response): Promise<void> => {
      const error = validateParams(req.params, ['gameType']);
      if (error) {
        res.status(400).json({ error });
        return;
      }

      const gameType = req.params.gameType!;
      const metadata = await gameManager.getGameMetadata(gameType);

      if (!metadata) {
        res.status(404).json({ error: `Game type not found: ${gameType}` });
        return;
      }

      res.json(metadata);
    })
  );

  // API: GET /v1/games/:gameType/rules - Get rules for specific game type
  // Contract: Returns rules string | 404 error
  router.get(
    '/v1/games/:gameType/rules',
    asyncHandler(async (req: Request, res: Response): Promise<void> => {
      const error = validateParams(req.params, ['gameType']);
      if (error) {
        res.status(400).json({ error });
        return;
      }

      const gameType = req.params.gameType!;

      try {
        const rules = await gameManager.getGameRules(gameType);
        if (!rules) {
          res.status(404).json({ error: `Rules not found for game type: ${gameType}` });
          return;
        }
        res.json({ gameType, rules });
      } catch {
        res.status(500).json({ error: 'Failed to load game rules' });
      }
    })
  );

  // API: POST /v1/games/:gameType/new - Create a new game instance
  // Contract: Accepts GameConfig, returns { gameId: string }
  router.post(
    '/v1/games/:gameType/new',
    validateBody(createGameSchema),
    asyncHandler(async (req: Request, res: Response): Promise<void> => {
      const error = validateParams(req.params, ['gameType']);
      if (error) {
        res.status(400).json({ error });
        return;
      }

      const gameType = req.params.gameType!;
      const { config } = req.body;

      try {
        const gameId = await gameManager.createGame(gameType, config);
        res.json({ gameId });
      } catch (error) {
        if ((error as Error).message.includes('Unknown game type')) {
          res.status(404).json({ error: (error as Error).message });
          return;
        }
        throw error;
      }
    })
  );

  // API: POST /v1/games/:gameType/:gameId/move - Make a move in the game
  // Contract: Accepts move data, returns updated GameState
  // CRITICAL: Core gameplay endpoint - handles all move execution
  router.post(
    '/v1/games/:gameType/:gameId/move',
    validateBody(moveDataSchema),
    asyncHandler(async (req: Request, res: Response): Promise<void> => {
      const error = validateParams(req.params, ['gameType', 'gameId']);
      if (error) {
        res.status(400).json({ error });
        return;
      }

      const gameType = req.params.gameType!;
      const gameId = req.params.gameId!;
      const moveData = req.body;

      try {
        const gameState = await gameManager.makeMove(gameType, gameId, moveData);
        res.json(gameState);
      } catch (error) {
        const errorMessage = (error as Error).message;
        if (errorMessage.includes('Game not found')) {
          res.status(404).json({ error: errorMessage });
          return;
        }
        if (
          errorMessage.includes('Invalid move') ||
          errorMessage.includes('Game is already over')
        ) {
          res.status(400).json({ error: errorMessage });
          return;
        }
        throw error;
      }
    })
  );

  // API: GET /v1/games/:gameType/:gameId/state - Get current game state
  // Contract: Returns current GameState
  // CRITICAL: Primary state access endpoint
  router.get(
    '/v1/games/:gameType/:gameId/state',
    asyncHandler(async (req: Request, res: Response): Promise<void> => {
      const error = validateParams(req.params, ['gameType', 'gameId']);
      if (error) {
        res.status(400).json({ error });
        return;
      }

      const gameType = req.params.gameType!;
      const gameId = req.params.gameId!;

      try {
        const gameState = await gameManager.getGameState(gameType, gameId);
        res.json(gameState);
      } catch (error) {
        if ((error as Error).message.includes('Game not found')) {
          res.status(404).json({ error: (error as Error).message });
          return;
        }
        throw error;
      }
    })
  );

  // API: GET /v1/games/:gameType/:gameId/history - Get game history
  // Contract: Returns GameMove[] array
  router.get(
    '/v1/games/:gameType/:gameId/history',
    asyncHandler(async (req: Request, res: Response): Promise<void> => {
      const error = validateParams(req.params, ['gameType', 'gameId']);
      if (error) {
        res.status(400).json({ error });
        return;
      }

      const gameType = req.params.gameType!;
      const gameId = req.params.gameId!;

      try {
        const history = await gameManager.getGameHistory(gameType, gameId);
        res.json(history);
      } catch (error) {
        if ((error as Error).message.includes('Game not found')) {
          res.status(404).json({ error: (error as Error).message });
          return;
        }
        throw error;
      }
    })
  );

  // API: POST /v1/games/:gameType/:gameId/restore - Restore game state from history
  // Contract: Accepts { history: GameMove[] }, returns { status: 'restored' }
  // CRITICAL: State restoration functionality
  router.post(
    '/v1/games/:gameType/:gameId/restore',
    validateBody(restoreGameSchema),
    asyncHandler(async (req: Request, res: Response): Promise<void> => {
      const error = validateParams(req.params, ['gameType', 'gameId']);
      if (error) {
        res.status(400).json({ error });
        return;
      }

      const gameType = req.params.gameType!;
      const gameId = req.params.gameId!;
      const { history } = req.body;

      try {
        await gameManager.restoreGame(gameType, gameId, history);
        res.json({ status: 'restored' });
      } catch (error) {
        if ((error as Error).message.includes('Game not found')) {
          res.status(404).json({ error: (error as Error).message });
          return;
        }
        throw error;
      }
    })
  );

  // API: DELETE /v1/games/:gameId - Delete a game
  // Contract: Returns { status: 'deleted' }
  router.delete(
    '/v1/games/:gameId',
    asyncHandler(async (req: Request, res: Response): Promise<void> => {
      const error = validateParams(req.params, ['gameId']);
      if (error) {
        res.status(400).json({ error });
        return;
      }

      const gameId = req.params.gameId!;
      await gameManager.deleteGame(gameId);
      res.json({ status: 'deleted' });
    })
  );

  // API: GET /v1/games/active - List all active games
  // Contract: Returns array of active game info
  // DEBT: Active games listing not implemented - returns empty array
  // TODO: Implement proper active games listing
  // Impact: Cannot monitor or list currently running games
  // Estimated effort: 1 day
  router.get(
    '/v1/games/active',
    asyncHandler(async (req: Request, res: Response): Promise<void> => {
      // DEBT: Placeholder implementation - should query gameManager for active games
      res.json([]);
    })
  );

  // API: GET /v1/games/:gameType/active - List active games of a specific type
  // Contract: Returns array of active games for specific type
  // DEBT: Active games filtering not implemented - returns empty array
  // TODO: Implement proper active games filtering
  // Impact: Cannot filter active games by type
  // Estimated effort: 1 day
  router.get(
    '/v1/games/:gameType/active',
    asyncHandler(async (req: Request, res: Response): Promise<void> => {
      const error = validateParams(req.params, ['gameType']);
      if (error) {
        res.status(400).json({ error });
        return;
      }

      // DEBT: Placeholder implementation - should filter by game type
      res.json([]);
    })
  );

  // API: POST /v1/games/:gameType/:gameId/validate - Validate a move without applying it
  // Contract: Accepts move data, returns validation result
  router.post(
    '/v1/games/:gameType/:gameId/validate',
    validateBody(moveDataSchema),
    asyncHandler(async (req: Request, res: Response): Promise<void> => {
      const error = validateParams(req.params, ['gameType', 'gameId']);
      if (error) {
        res.status(400).json({ error });
        return;
      }

      const gameType = req.params.gameType!;
      const gameId = req.params.gameId!;
      const moveData = req.body;

      try {
        const game = await gameManager.getGame(gameType, gameId);
        const validation = await game.validateMove(moveData);
        res.json(validation);
      } catch (error) {
        if ((error as Error).message.includes('Game not found')) {
          res.status(404).json({ error: (error as Error).message });
          return;
        }
        throw error;
      }
    })
  );

  // API: POST /v1/games/:gameType/:gameId/undo - Undo last move
  // Contract: Returns updated state with undo/redo status
  router.post(
    '/v1/games/:gameType/:gameId/undo',
    asyncHandler(async (req: Request, res: Response): Promise<void> => {
      const error = validateParams(req.params, ['gameType', 'gameId']);
      if (error) {
        res.status(400).json({ error });
        return;
      }

      const gameType = req.params.gameType!;
      const gameId = req.params.gameId!;

      try {
        const game = await gameManager.getGame(gameType, gameId);

        if (!game.canUndo()) {
          res.status(400).json({ error: 'Cannot undo - no previous moves available' });
          return;
        }

        const gameState = await game.undoMove();
        if (gameState === null) {
          res.status(400).json({ error: 'Undo failed - no previous state available' });
          return;
        }

        res.json({
          success: true,
          message: 'Move undone successfully',
          gameState,
          canUndo: game.canUndo(),
          canRedo: game.canRedo(),
        });
      } catch (error) {
        if ((error as Error).message.includes('Game not found')) {
          res.status(404).json({ error: (error as Error).message });
          return;
        }
        throw error;
      }
    })
  );

  // API: POST /v1/games/:gameType/:gameId/redo - Redo next move
  // Contract: Returns updated state with undo/redo status
  router.post(
    '/v1/games/:gameType/:gameId/redo',
    asyncHandler(async (req: Request, res: Response): Promise<void> => {
      const error = validateParams(req.params, ['gameType', 'gameId']);
      if (error) {
        res.status(400).json({ error });
        return;
      }

      const gameType = req.params.gameType!;
      const gameId = req.params.gameId!;

      try {
        const game = await gameManager.getGame(gameType, gameId);

        if (!game.canRedo()) {
          res.status(400).json({ error: 'Cannot redo - no next moves available' });
          return;
        }

        const gameState = await game.redoMove();
        if (gameState === null) {
          res.status(400).json({ error: 'Redo failed - no next state available' });
          return;
        }

        res.json({
          success: true,
          message: 'Move redone successfully',
          gameState,
          canUndo: game.canUndo(),
          canRedo: game.canRedo(),
        });
      } catch (error) {
        if ((error as Error).message.includes('Game not found')) {
          res.status(404).json({ error: (error as Error).message });
          return;
        }
        throw error;
      }
    })
  );

  // API: GET /v1/games/:gameType/:gameId/undo-status - Check undo/redo availability
  // Contract: Returns { canUndo: boolean, canRedo: boolean }
  router.get(
    '/v1/games/:gameType/:gameId/undo-status',
    asyncHandler(async (req: Request, res: Response): Promise<void> => {
      const error = validateParams(req.params, ['gameType', 'gameId']);
      if (error) {
        res.status(400).json({ error });
        return;
      }

      const gameType = req.params.gameType!;
      const gameId = req.params.gameId!;

      try {
        const game = await gameManager.getGame(gameType, gameId);
        res.json({
          canUndo: game.canUndo(),
          canRedo: game.canRedo(),
        });
      } catch (error) {
        if ((error as Error).message.includes('Game not found')) {
          res.status(404).json({ error: (error as Error).message });
          return;
        }
        throw error;
      }
    })
  );

  // API: GET /v1/stats - Get comprehensive server statistics
  // Contract: Returns global statistics object
  router.get(
    '/v1/stats',
    asyncHandler(async (req: Request, res: Response): Promise<void> => {
      const stats = await gameManager.getStatsService().getGlobalStats();
      res.json(stats);
    })
  );

  // API: GET /v1/stats/:gameType - Get statistics for specific game type
  // Contract: Returns game type specific statistics
  router.get(
    '/v1/stats/:gameType',
    asyncHandler(async (req: Request, res: Response): Promise<void> => {
      const error = validateParams(req.params, ['gameType']);
      if (error) {
        res.status(400).json({ error });
        return;
      }

      const gameType = req.params.gameType!;
      const stats = await gameManager.getStatsService().getGameTypeStats(gameType);
      res.json(stats);
    })
  );

  // API: GET /v1/docs - API documentation endpoint
  // Contract: Returns comprehensive API documentation
  router.get('/v1/docs', (req: Request, res: Response): void => {
    const apiDocs = {
      title: 'Versus Game Server API',
      version: '1.0.0',
      description: 'REST API for managing multiplayer games with AI agent support',
      baseUrl: `${req.protocol}://${req.get('host')}/api/v1`,
      endpoints: {
        games: {
          'GET /v1/games': 'List all available game types',
          'GET /v1/games/metadata': 'Get metadata for all games',
          'GET /v1/games/:gameType/metadata': 'Get metadata for specific game type',
          'GET /v1/games/active': 'List all active games',
          'GET /v1/games/:gameType/active': 'List active games of specific type',
          'POST /v1/games/:gameType/new': 'Create new game instance',
          'GET /v1/games/:gameType/:gameId/state': 'Get current game state',
          'POST /v1/games/:gameType/:gameId/move': 'Make a move in the game',
          'POST /v1/games/:gameType/:gameId/validate': 'Validate a move without applying it',
          'GET /v1/games/:gameType/:gameId/history': 'Get game move history',
          'POST /v1/games/:gameType/:gameId/restore': 'Restore game from history',
          'DELETE /v1/games/:gameId': 'Delete a game instance',
        },
        stats: {
          'GET /v1/stats': 'Get comprehensive server statistics',
          'GET /v1/stats/:gameType': 'Get statistics for specific game type',
        },
        utility: {
          'GET /v1/health': 'Health check endpoint',
          'GET /v1/docs': 'This API documentation',
        },
      },
      gameTypes: gameManager.getAvailableGameTypes(),
      examples: {
        createGame: {
          url: '/v1/games/tic-tac-toe/new',
          method: 'POST',
          body: { config: { maxPlayers: 2 } },
        },
        makeMove: {
          url: '/v1/games/tic-tac-toe/{gameId}/move',
          method: 'POST',
          body: { row: 0, col: 0, player: 'X' },
        },
      },
    };
    res.json(apiDocs);
  });

  // API: GET /v1/health - Health check endpoint
  // Contract: Returns server health status
  router.get('/v1/health', (req: Request, res: Response): void => {
    res.json({
      status: 'healthy',
      timestamp: new Date().toISOString(),
      uptime: process.uptime(),
      gameTypes: gameManager.getAvailableGameTypes().length,
      environment: process.env.NODE_ENV || 'development',
    });
  });

  return router;
}
