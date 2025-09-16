import { logger } from './logger.js';

/* eslint-disable no-unused-vars */
export enum ErrorCode {
  // Validation errors
  INVALID_MOVE_FORMAT = 'INVALID_MOVE_FORMAT',
  INVALID_GAME_CONFIG = 'INVALID_GAME_CONFIG',
  INVALID_PLAYER = 'INVALID_PLAYER',
  INVALID_POSITION = 'INVALID_POSITION',

  // Game state errors
  GAME_ALREADY_OVER = 'GAME_ALREADY_OVER',
  NOT_PLAYER_TURN = 'NOT_PLAYER_TURN',
  POSITION_OCCUPIED = 'POSITION_OCCUPIED',
  INSUFFICIENT_RESOURCES = 'INSUFFICIENT_RESOURCES',

  // System errors
  GAME_NOT_FOUND = 'GAME_NOT_FOUND',
  GAME_TYPE_NOT_FOUND = 'GAME_TYPE_NOT_FOUND',
  PERSISTENCE_ERROR = 'PERSISTENCE_ERROR',
  DATABASE_ERROR = 'DATABASE_ERROR',

  // Network errors
  NETWORK_ERROR = 'NETWORK_ERROR',
  TIMEOUT_ERROR = 'TIMEOUT_ERROR',

  // Generic errors
  INTERNAL_ERROR = 'INTERNAL_ERROR',
  UNKNOWN_ERROR = 'UNKNOWN_ERROR',
}
/* eslint-enable no-unused-vars */

export interface ErrorContext {
  gameId?: string;
  gameType?: string;
  player?: string;
  action?: string;
  details?: Record<string, any>;
  timestamp?: number;
}

export class GameError extends Error {
  public readonly code: ErrorCode;
  public readonly context: ErrorContext;
  public readonly isOperational: boolean;

  constructor(
    message: string,
    code: ErrorCode = ErrorCode.UNKNOWN_ERROR,
    context: ErrorContext = {},
    isOperational: boolean = true
  ) {
    super(message);
    this.name = 'GameError';
    this.code = code;
    this.context = {
      ...context,
      timestamp: context.timestamp || Date.now(),
    };
    this.isOperational = isOperational;

    // Maintain proper stack trace
    if (Error.captureStackTrace) {
      Error.captureStackTrace(this, GameError);
    }
  }
}

export class ValidationError extends GameError {
  constructor(message: string, context: ErrorContext = {}) {
    super(message, ErrorCode.INVALID_MOVE_FORMAT, context, true);
    this.name = 'ValidationError';
  }
}

export class GameStateError extends GameError {
  constructor(message: string, code: ErrorCode, context: ErrorContext = {}) {
    super(message, code, context, true);
    this.name = 'GameStateError';
  }
}

export class SystemError extends GameError {
  constructor(message: string, code: ErrorCode, context: ErrorContext = {}) {
    super(message, code, context, false);
    this.name = 'SystemError';
  }
}

export class ErrorHandler {
  private static instance: ErrorHandler;

  private constructor() {}

  public static getInstance(): ErrorHandler {
    if (!ErrorHandler.instance) {
      ErrorHandler.instance = new ErrorHandler();
    }
    return ErrorHandler.instance;
  }

  public handleError(error: Error, context: ErrorContext = {}): GameError {
    // If it's already a GameError, just log and return
    if (error instanceof GameError) {
      this.logError(error);
      return error;
    }

    // Convert regular errors to GameError
    const gameError = new GameError(error.message, ErrorCode.UNKNOWN_ERROR, context, false);

    this.logError(gameError, error);
    return gameError;
  }

  public handleValidationError(message: string, context: ErrorContext = {}): ValidationError {
    const error = new ValidationError(message, context);
    this.logError(error);
    return error;
  }

  public handleGameStateError(
    message: string,
    code: ErrorCode,
    context: ErrorContext = {}
  ): GameStateError {
    const error = new GameStateError(message, code, context);
    this.logError(error);
    return error;
  }

  public handleSystemError(
    message: string,
    code: ErrorCode,
    context: ErrorContext = {}
  ): SystemError {
    const error = new SystemError(message, code, context);
    this.logError(error);
    return error;
  }

  private logError(gameError: GameError, originalError?: Error): void {
    const logContext = {
      code: gameError.code,
      isOperational: gameError.isOperational,
      ...gameError.context,
    };

    if (gameError.context.gameId && gameError.context.gameType) {
      logger.gameError(
        gameError.message,
        originalError || gameError,
        gameError.context.gameId,
        gameError.context.gameType,
        logContext
      );
    } else {
      logger.error(gameError.message, originalError || gameError, logContext);
    }
  }

  public createErrorResponse(error: GameError): {
    error: string;
    code: string;
    details?: Record<string, any>;
  } {
    return {
      error: error.message,
      code: error.code,
      details: error.isOperational ? error.context.details : undefined,
    };
  }

  public isOperationalError(error: Error): boolean {
    return error instanceof GameError && error.isOperational;
  }
}

// Export singleton instance
export const errorHandler = ErrorHandler.getInstance();

// Utility functions for common error patterns
export function createValidationError(
  message: string,
  context: ErrorContext = {}
): ValidationError {
  return errorHandler.handleValidationError(message, context);
}

export function createGameStateError(
  message: string,
  code: ErrorCode,
  context: ErrorContext = {}
): GameStateError {
  return errorHandler.handleGameStateError(message, code, context);
}

export function createSystemError(
  message: string,
  code: ErrorCode,
  context: ErrorContext = {}
): SystemError {
  return errorHandler.handleSystemError(message, code, context);
}

// Common validation helpers
export const ValidationErrors = {
  invalidMoveFormat: (context?: ErrorContext) =>
    createValidationError('Invalid move data format', context),

  gameAlreadyOver: (context?: ErrorContext) =>
    createGameStateError('Game is already over', ErrorCode.GAME_ALREADY_OVER, context),

  notPlayerTurn: (currentPlayer: string, expectedPlayer: string, context?: ErrorContext) =>
    createGameStateError(
      `It's ${expectedPlayer}'s turn, not ${currentPlayer}'s`,
      ErrorCode.NOT_PLAYER_TURN,
      {
        ...context,
        details: { currentPlayer, expectedPlayer },
      }
    ),

  invalidPlayer: (player: string, context?: ErrorContext) =>
    createValidationError(`Invalid player: ${player}`, {
      ...context,
      details: { player },
    }),

  positionOccupied: (position: { row: number; col: number }, context?: ErrorContext) =>
    createGameStateError(
      `Position is already occupied: (${position.row}, ${position.col})`,
      ErrorCode.POSITION_OCCUPIED,
      {
        ...context,
        details: { position },
      }
    ),

  gameNotFound: (gameId: string, context?: ErrorContext) =>
    createSystemError(`Game not found: ${gameId}`, ErrorCode.GAME_NOT_FOUND, {
      ...context,
      details: { gameId },
    }),
};
