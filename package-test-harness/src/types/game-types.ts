/**
 * Enhanced type definitions for game development
 * This file provides stronger typing, better validation, and consistent interfaces
 */

import type { GameMetadata, GameConfig, MoveValidationResult } from './game.js';

// Enhanced base types with better constraints
export interface Position {
  readonly row: number;
  readonly col: number;
}

export interface Bounds {
  readonly minRow: number;
  readonly maxRow: number;
  readonly minCol: number;
  readonly maxCol: number;
}

// Standard player types for different game categories
export type TwoPlayerGame = 'player1' | 'player2';
export type ChessPlayers = 'white' | 'black';
export type StandardColors = 'red' | 'blue' | 'green' | 'yellow';
export type CardinalDirections = 'north' | 'south' | 'east' | 'west';

// Enhanced move validation with detailed error information
export interface EnhancedMoveValidationResult extends MoveValidationResult {
  errorCode?: string;
  errorDetails?: Record<string, any>;
  suggestions?: string[];
}

// Generic game state interface with required fields
export interface BaseGameState<TPlayer extends string = string> {
  readonly gameId: string;
  readonly gameType: string;
  readonly currentPlayer: TPlayer;
  readonly gameOver: boolean;
  readonly winner: TPlayer | null;
  readonly gamePhase: string;
  readonly playerOrder: readonly TPlayer[];
  readonly timestamp: number;
}

// Enhanced move interface with better typing
export interface BaseMove<TPlayer extends string = string, TAction extends string = string> {
  readonly player: TPlayer;
  readonly action: TAction;
  readonly timestamp?: number;
  readonly metadata?: Record<string, any>;
}

// Board game specific types
export interface BoardGameState<TPlayer extends string, TCell = any>
  extends BaseGameState<TPlayer> {
  readonly board: readonly (readonly TCell[])[];
  readonly boardSize: number;
}

export interface BoardMove<TPlayer extends string> extends BaseMove<TPlayer> {
  readonly position?: Position;
  readonly from?: Position;
  readonly to?: Position;
}

// Card game specific types
export interface Card {
  readonly suit: string;
  readonly rank: string;
  readonly value: number;
  readonly id?: string;
}

export interface CardGameState<TPlayer extends string> extends BaseGameState<TPlayer> {
  readonly deck: readonly Card[];
  readonly discardPile: readonly Card[];
}

export interface CardMove<TPlayer extends string> extends BaseMove<TPlayer> {
  readonly card?: Card;
  readonly cards?: readonly Card[];
}

// Validation schemas for common patterns
export interface ValidationSchema<T = any> {
  required: readonly (keyof T)[];
  optional?: readonly (keyof T)[];
  validators?: Partial<Record<keyof T, (_value: any) => boolean>>;
  customValidation?: (_data: T) => EnhancedMoveValidationResult;
}

// Game configuration with stronger typing
export interface EnhancedGameConfig extends GameConfig {
  playerIds?: readonly string[];
  gameSettings?: Record<string, any>;
  ruleVariants?: Record<string, boolean>;
  timeControls?: {
    turnTimeLimit?: number;
    gameTimeLimit?: number;
    incrementPerMove?: number;
  };
}

// Enhanced metadata with additional fields
export interface EnhancedGameMetadata extends GameMetadata {
  version: string;
  tags: readonly string[];
  rules: {
    objective: string;
    setup: string;
    gameplay: string;
    winning: string;
  };
  variants?: readonly {
    name: string;
    description: string;
    changes: Record<string, any>;
  }[];
  balancing?: {
    skillBased: number; // 0-100 percentage
    luckBased: number; // 0-100 percentage
    interactive: number; // 0-100 percentage
  };
}

// Error handling types
export enum GameErrorCode {
  INVALID_MOVE_FORMAT = 'INVALID_MOVE_FORMAT',
  GAME_ALREADY_OVER = 'GAME_ALREADY_OVER',
  NOT_PLAYER_TURN = 'NOT_PLAYER_TURN',
  INVALID_PLAYER = 'INVALID_PLAYER',
  INVALID_POSITION = 'INVALID_POSITION',
  POSITION_OCCUPIED = 'POSITION_OCCUPIED',
  INSUFFICIENT_RESOURCES = 'INSUFFICIENT_RESOURCES',
  INVALID_GAME_PHASE = 'INVALID_GAME_PHASE',
  RULE_VIOLATION = 'RULE_VIOLATION',
  TIMEOUT = 'TIMEOUT',
}

export class GameError extends Error {
  constructor(
    public readonly code: GameErrorCode,
    message: string,
    public readonly details?: Record<string, any>
  ) {
    super(message);
    this.name = 'GameError';
  }
}

// Utility types for better type inference
export type ExtractPlayer<T> = T extends BaseGameState<infer P> ? P : never;
export type ExtractCell<T> = T extends BoardGameState<any, infer C> ? C : never;

// Common game patterns as reusable types
export interface TurnBasedGameState<TPlayer extends string> extends BaseGameState<TPlayer> {
  readonly turnNumber: number;
  readonly actionsPerTurn?: number;
  readonly actionsRemaining?: number;
}

export interface ScoredGameState<TPlayer extends string> extends BaseGameState<TPlayer> {
  readonly scores: Readonly<Record<TPlayer, number>>;
  readonly targetScore?: number;
}

export interface TimedGameState<TPlayer extends string> extends BaseGameState<TPlayer> {
  readonly timeRemaining: Readonly<Record<TPlayer, number>>;
  readonly lastMoveTime: number;
}

// Resource management types for strategy games
export interface ResourceState {
  readonly [resourceType: string]: number;
}

export interface ResourceGameState<TPlayer extends string> extends BaseGameState<TPlayer> {
  readonly playerResources: Readonly<Record<TPlayer, ResourceState>>;
}

// Auction/bidding game types
export interface BiddingState<TPlayer extends string> {
  readonly currentBid: number;
  readonly currentBidder: TPlayer | null;
  readonly biddingRound: number;
}

export interface AuctionGameState<TPlayer extends string> extends BaseGameState<TPlayer> {
  readonly auction: BiddingState<TPlayer> | null;
}

// Real-time game types
export interface RealTimeGameState<TPlayer extends string> extends BaseGameState<TPlayer> {
  readonly gameSpeed: number;
  readonly pausedBy: TPlayer | null;
  readonly lastUpdate: number;
}

// Game history and replay types
export interface GameSnapshot<TState = any> {
  readonly state: TState;
  readonly timestamp: number;
  readonly moveNumber: number;
}

export interface ReplayableGameState<TState = any> {
  readonly snapshots: readonly GameSnapshot<TState>[];
  readonly canUndo: boolean;
  readonly canRedo: boolean;
}

// Advanced validation helpers
export class ValidationBuilder<T> {
  private schema: ValidationSchema<T> = { required: [] };

  require(...fields: (keyof T)[]): this {
    this.schema.required = [...this.schema.required, ...fields];
    return this;
  }

  optional(...fields: (keyof T)[]): this {
    this.schema.optional = [...(this.schema.optional || []), ...fields];
    return this;
  }

  validate<K extends keyof T>(field: K, validator: (_value: T[K]) => boolean): this {
    if (!this.schema.validators) {
      this.schema.validators = {};
    }
    this.schema.validators[field] = validator;
    return this;
  }

  custom(validator: (_data: T) => EnhancedMoveValidationResult): this {
    this.schema.customValidation = validator;
    return this;
  }

  build(): ValidationSchema<T> {
    return { ...this.schema };
  }
}

// Type guards for runtime validation
export function isPosition(value: any): value is Position {
  return (
    typeof value === 'object' &&
    value !== null &&
    typeof value.row === 'number' &&
    typeof value.col === 'number' &&
    Number.isInteger(value.row) &&
    Number.isInteger(value.col)
  );
}

export function isCard(value: any): value is Card {
  return (
    typeof value === 'object' &&
    value !== null &&
    typeof value.suit === 'string' &&
    typeof value.rank === 'string' &&
    typeof value.value === 'number'
  );
}

export function isValidPlayer<T extends string>(
  value: any,
  validPlayers: readonly T[]
): value is T {
  return typeof value === 'string' && validPlayers.includes(value as T);
}

// Utility functions for common validations
export function validateBounds(position: Position, bounds: Bounds): boolean {
  return (
    position.row >= bounds.minRow &&
    position.row <= bounds.maxRow &&
    position.col >= bounds.minCol &&
    position.col <= bounds.maxCol
  );
}

export function validateTurnOrder<T extends string>(
  currentPlayer: T,
  expectedPlayer: T
): EnhancedMoveValidationResult {
  if (currentPlayer !== expectedPlayer) {
    return {
      valid: false,
      error: `It's ${expectedPlayer}'s turn`,
      errorCode: GameErrorCode.NOT_PLAYER_TURN,
      errorDetails: { currentPlayer, expectedPlayer },
    };
  }
  return { valid: true };
}

export function validateGamePhase(
  currentPhase: string,
  allowedPhases: readonly string[]
): EnhancedMoveValidationResult {
  if (!allowedPhases.includes(currentPhase)) {
    return {
      valid: false,
      error: `Invalid game phase: ${currentPhase}`,
      errorCode: GameErrorCode.INVALID_GAME_PHASE,
      errorDetails: { currentPhase, allowedPhases },
    };
  }
  return { valid: true };
}

// Factory functions for creating common validation results
export const ValidationResults = {
  success(): EnhancedMoveValidationResult {
    return { valid: true };
  },

  error(
    message: string,
    code?: GameErrorCode,
    details?: Record<string, any>
  ): EnhancedMoveValidationResult {
    return {
      valid: false,
      error: message,
      errorCode: code,
      errorDetails: details,
    };
  },

  invalidFormat(details?: Record<string, any>): EnhancedMoveValidationResult {
    return this.error('Invalid move data format', GameErrorCode.INVALID_MOVE_FORMAT, details);
  },

  gameOver(): EnhancedMoveValidationResult {
    return this.error('Game is already over', GameErrorCode.GAME_ALREADY_OVER);
  },

  notYourTurn(currentPlayer: string, expectedPlayer: string): EnhancedMoveValidationResult {
    return this.error(`It's ${expectedPlayer}'s turn`, GameErrorCode.NOT_PLAYER_TURN, {
      currentPlayer,
      expectedPlayer,
    });
  },

  invalidPlayer(player: string): EnhancedMoveValidationResult {
    return this.error(`Invalid player: ${player}`, GameErrorCode.INVALID_PLAYER, { player });
  },

  invalidPosition(position: Position): EnhancedMoveValidationResult {
    return this.error(
      `Invalid position: (${position.row}, ${position.col})`,
      GameErrorCode.INVALID_POSITION,
      { position }
    );
  },

  positionOccupied(position: Position): EnhancedMoveValidationResult {
    return this.error(
      `Position is already occupied: (${position.row}, ${position.col})`,
      GameErrorCode.POSITION_OCCUPIED,
      { position }
    );
  },
};

// Decorator for adding validation to game methods
export function validateMove<T extends (..._args: any[]) => any>(schema: ValidationSchema) {
  return function (_target: any, _propertyKey: string, descriptor: TypedPropertyDescriptor<T>) {
    const originalMethod = descriptor.value;
    if (!originalMethod) {
      return;
    }

    descriptor.value = function (this: any, ..._args: any[]) {
      const moveData = _args[0];

      // Validate required fields
      for (const field of schema.required) {
        if (!(field in moveData) || moveData[field] === undefined || moveData[field] === null) {
          throw new GameError(
            GameErrorCode.INVALID_MOVE_FORMAT,
            `Missing required field: ${String(field)}`
          );
        }
      }

      // Validate field types
      if (schema.validators) {
        for (const [field, validator] of Object.entries(schema.validators)) {
          if (field in moveData && validator && !validator(moveData[field])) {
            throw new GameError(
              GameErrorCode.INVALID_MOVE_FORMAT,
              `Invalid value for field: ${field}`
            );
          }
        }
      }

      // Custom validation
      if (schema.customValidation) {
        const result = schema.customValidation(moveData);
        if (!result.valid) {
          throw new GameError(
            (result.errorCode as GameErrorCode) || GameErrorCode.RULE_VIOLATION,
            result.error || 'Move validation failed'
          );
        }
      }

      return originalMethod.apply(this, _args);
    } as T;
  };
}

