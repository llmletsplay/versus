import { Router } from 'express';
import { GameManager } from '../core/game-manager.js';
import { z } from 'zod';
import type { Request, Response, NextFunction } from 'express';
import { errorHandler, GameError } from '../utils/error-handler.js';

// Validation schemas
const moveDataSchema = z
  .object({
    player: z.string().optional(),
    moveData: z.record(z.any()).optional(),
  })
  .passthrough(); // Allow additional properties

const restoreGameSchema = z.object({
  history: z.array(
    z.object({
      player: z.string(),
      moveData: z.record(z.any()),
      timestamp: z.number(),
    })
  ),
});

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

// Middleware for error handling
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

// Middleware for validation
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

// Helper function to validate required params
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

export function createGameRoutes(gameManager: GameManager): Router {
  const router = Router();

  // GET /v1/games - List all available game types
  router.get(
    '/v1/games',
    asyncHandler(async (req: Request, res: Response): Promise<void> => {
      const gameTypes = gameManager.getAvailableGameTypes();
      res.json(gameTypes);
    })
  );

  // GET /v1/games/metadata - Get metadata for all games
  router.get(
    '/v1/games/metadata',
    asyncHandler(async (req: Request, res: Response): Promise<void> => {
      const metadata = await gameManager.getAllGameMetadata();
      res.json(metadata);
    })
  );

  // GET /v1/games/:gameType/metadata - Get metadata for specific game type
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

  // GET /v1/games/:gameType/rules - Get rules for specific game type
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

  // POST /v1/games/:gameType/new - Create a new game instance
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

  // POST /v1/games/:gameType/:gameId/move - Make a move in the game
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

  // GET /v1/games/:gameType/:gameId/state - Get current game state
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

  // GET /v1/games/:gameType/:gameId/history - Get game history
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

  // POST /v1/games/:gameType/:gameId/restore - Restore game state from history
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

  // DELETE /v1/games/:gameId - Delete a game
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

  // GET /v1/games/active - List all active games
  router.get(
    '/v1/games/active',
    asyncHandler(async (req: Request, res: Response): Promise<void> => {
      // This would require adding a method to game manager to list active games
      // For now, return an empty array - this could be enhanced
      res.json([]);
    })
  );

  // GET /v1/games/:gameType/active - List active games of a specific type
  router.get(
    '/v1/games/:gameType/active',
    asyncHandler(async (req: Request, res: Response): Promise<void> => {
      const error = validateParams(req.params, ['gameType']);
      if (error) {
        res.status(400).json({ error });
        return;
      }

      // This would require adding a method to game manager to list active games by type
      // For now, return an empty array - this could be enhanced
      res.json([]);
    })
  );

  // POST /v1/games/:gameType/:gameId/validate - Validate a move without applying it
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

  // POST /v1/games/:gameType/:gameId/undo - Undo last move
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

  // POST /v1/games/:gameType/:gameId/redo - Redo next move
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

  // GET /v1/games/:gameType/:gameId/undo-status - Check undo/redo availability
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

  // Stats endpoints
  router.get(
    '/v1/stats',
    asyncHandler(async (req: Request, res: Response): Promise<void> => {
      const stats = await gameManager.getStatsService().getGlobalStats();
      res.json(stats);
    })
  );

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

  // API Documentation endpoint
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

  // Health check endpoint
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
