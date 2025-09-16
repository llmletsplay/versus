/**
 * Standardized validation patterns and helpers
 * Provides reusable validation logic to reduce boilerplate and improve consistency
 */

import type { MoveValidationResult } from '../types/game.js';
import { ERROR_MESSAGES } from './game-constants.js';

/**
 * Validation result with chaining support
 */
export class ValidationChain {
  private results: MoveValidationResult[] = [];

  add(result: MoveValidationResult): this {
    this.results.push(result);
    return this;
  }

  validate(): MoveValidationResult {
    for (const result of this.results) {
      if (!result.valid) {
        return result;
      }
    }
    return { valid: true };
  }

  static create(): ValidationChain {
    return new ValidationChain();
  }
}

/**
 * Common validation patterns
 */
export class Validators {
  /**
   * Validate required fields exist in move data
   */
  static requiredFields(moveData: Record<string, any>, fields: string[]): MoveValidationResult {
    for (const field of fields) {
      if (!(field in moveData) || moveData[field] === undefined || moveData[field] === null) {
        return { valid: false, error: `${ERROR_MESSAGES.MISSING_REQUIRED_FIELDS}: ${field}` };
      }
    }
    return { valid: true };
  }

  /**
   * Validate player is valid
   */
  static validPlayer(player: string, validPlayers: string[]): MoveValidationResult {
    if (!validPlayers.includes(player)) {
      return { valid: false, error: ERROR_MESSAGES.INVALID_PLAYER };
    }
    return { valid: true };
  }

  /**
   * Validate it's the player's turn
   */
  static playerTurn(player: string, currentPlayer: string): MoveValidationResult {
    if (player !== currentPlayer) {
      return { valid: false, error: ERROR_MESSAGES.NOT_YOUR_TURN };
    }
    return { valid: true };
  }

  /**
   * Validate game is not over
   */
  static gameNotOver(gameOver: boolean): MoveValidationResult {
    if (gameOver) {
      return { valid: false, error: ERROR_MESSAGES.GAME_OVER };
    }
    return { valid: true };
  }

  /**
   * Validate board position
   */
  static boardPosition(row: number, col: number, boardSize: number): MoveValidationResult {
    if (row < 0 || row >= boardSize || col < 0 || col >= boardSize) {
      return { valid: false, error: ERROR_MESSAGES.INVALID_POSITION };
    }
    return { valid: true };
  }

  /**
   * Validate cell is empty
   */
  static emptyCell(
    board: any[][],
    row: number,
    col: number,
    emptyValue: any = null
  ): MoveValidationResult {
    if (board[row]?.[col] !== emptyValue) {
      return { valid: false, error: 'Cell is already occupied' };
    }
    return { valid: true };
  }

  /**
   * Validate array index
   */
  static arrayIndex(index: number, arrayLength: number): MoveValidationResult {
    if (index < 0 || index >= arrayLength) {
      return { valid: false, error: 'Invalid array index' };
    }
    return { valid: true };
  }

  /**
   * Validate number range
   */
  static numberRange(value: number, min: number, max: number): MoveValidationResult {
    if (value < min || value > max) {
      return { valid: false, error: `Value must be between ${min} and ${max}` };
    }
    return { valid: true };
  }

  /**
   * Validate value is one of allowed values
   */
  static allowedValues<T>(value: T, allowedValues: T[]): MoveValidationResult {
    if (!allowedValues.includes(value)) {
      return { valid: false, error: `Value must be one of: ${allowedValues.join(', ')}` };
    }
    return { valid: true };
  }

  /**
   * Validate minimum resource requirement
   */
  static minimumResources(current: number, required: number): MoveValidationResult {
    if (current < required) {
      return { valid: false, error: ERROR_MESSAGES.INSUFFICIENT_RESOURCES };
    }
    return { valid: true };
  }

  /**
   * Custom validation with predicate function
   */
  static custom(predicate: () => boolean, errorMessage: string): MoveValidationResult {
    if (!predicate()) {
      return { valid: false, error: errorMessage };
    }
    return { valid: true };
  }
}

/**
 * Board-specific validators
 */
export class BoardValidators {
  /**
   * Validate standard board move
   */
  static standardMove(
    moveData: Record<string, any>,
    boardSize: number,
    currentPlayer: string,
    gameOver: boolean,
    board?: any[][],
    emptyValue: any = null
  ): MoveValidationResult {
    return ValidationChain.create()
      .add(Validators.gameNotOver(gameOver))
      .add(Validators.requiredFields(moveData, ['player', 'row', 'col']))
      .add(Validators.playerTurn(moveData.player, currentPlayer))
      .add(Validators.boardPosition(moveData.row, moveData.col, boardSize))
      .add(
        board
          ? Validators.emptyCell(board, moveData.row, moveData.col, emptyValue)
          : { valid: true }
      )
      .validate();
  }

  /**
   * Validate piece movement
   */
  static pieceMovement(
    fromRow: number,
    fromCol: number,
    toRow: number,
    toCol: number,
    boardSize: number,
    board: any[][],
    player: any,
    emptyValue: any = null
  ): MoveValidationResult {
    return ValidationChain.create()
      .add(Validators.boardPosition(fromRow, fromCol, boardSize))
      .add(Validators.boardPosition(toRow, toCol, boardSize))
      .add(
        Validators.custom(() => board[fromRow]?.[fromCol] === player, 'No piece at source position')
      )
      .add(Validators.emptyCell(board, toRow, toCol, emptyValue))
      .validate();
  }

  /**
   * Validate adjacent move
   */
  static adjacentMove(
    fromRow: number,
    fromCol: number,
    toRow: number,
    toCol: number
  ): MoveValidationResult {
    const rowDiff = Math.abs(toRow - fromRow);
    const colDiff = Math.abs(toCol - fromCol);

    if (rowDiff <= 1 && colDiff <= 1 && rowDiff + colDiff > 0) {
      return { valid: true };
    }

    return { valid: false, error: 'Move must be to an adjacent cell' };
  }

  /**
   * Validate line movement (horizontal, vertical, diagonal)
   */
  static lineMovement(
    fromRow: number,
    fromCol: number,
    toRow: number,
    toCol: number,
    board: any[][],
    emptyValue: any = null
  ): MoveValidationResult {
    const rowDiff = toRow - fromRow;
    const colDiff = toCol - fromCol;

    // Check if it's a valid line (horizontal, vertical, or diagonal)
    if (rowDiff !== 0 && colDiff !== 0 && Math.abs(rowDiff) !== Math.abs(colDiff)) {
      return { valid: false, error: 'Move must be in a straight line' };
    }

    // Check path is clear
    const steps = Math.max(Math.abs(rowDiff), Math.abs(colDiff));
    const rowStep = rowDiff === 0 ? 0 : rowDiff / Math.abs(rowDiff);
    const colStep = colDiff === 0 ? 0 : colDiff / Math.abs(colDiff);

    for (let i = 1; i < steps; i++) {
      const checkRow = fromRow + i * rowStep;
      const checkCol = fromCol + i * colStep;

      if (board[checkRow]?.[checkCol] !== emptyValue) {
        return { valid: false, error: 'Path is blocked' };
      }
    }

    return { valid: true };
  }
}

/**
 * Card-specific validators
 */
export class CardValidators {
  /**
   * Validate standard card play
   */
  static standardPlay(
    moveData: Record<string, any>,
    playerHand: any[],
    currentPlayer: string,
    gameOver: boolean
  ): MoveValidationResult {
    return ValidationChain.create()
      .add(Validators.gameNotOver(gameOver))
      .add(Validators.requiredFields(moveData, ['player', 'cardIndex']))
      .add(Validators.playerTurn(moveData.player, currentPlayer))
      .add(Validators.arrayIndex(moveData.cardIndex, playerHand.length))
      .validate();
  }

  /**
   * Validate card matches criteria
   */
  static cardMatches(
    card: { suit?: string; rank?: string; value?: number },
    criteria: { suit?: string; rank?: string; value?: number }
  ): MoveValidationResult {
    if (criteria.suit && card.suit !== criteria.suit) {
      return { valid: false, error: `Card must be ${criteria.suit}` };
    }

    if (criteria.rank && card.rank !== criteria.rank) {
      return { valid: false, error: `Card must be ${criteria.rank}` };
    }

    if (criteria.value !== undefined && card.value !== criteria.value) {
      return { valid: false, error: `Card value must be ${criteria.value}` };
    }

    return { valid: true };
  }

  /**
   * Validate hand size
   */
  static handSize(hand: any[], minSize: number, maxSize?: number): MoveValidationResult {
    if (hand.length < minSize) {
      return { valid: false, error: `Hand must have at least ${minSize} cards` };
    }

    if (maxSize !== undefined && hand.length > maxSize) {
      return { valid: false, error: `Hand cannot have more than ${maxSize} cards` };
    }

    return { valid: true };
  }
}

/**
 * Resource-specific validators
 */
export class ResourceValidators {
  /**
   * Validate resource cost
   */
  static canAfford(
    playerResources: Record<string, number>,
    cost: Record<string, number>
  ): MoveValidationResult {
    for (const [resource, amount] of Object.entries(cost)) {
      const available = playerResources[resource] || 0;
      if (available < amount) {
        return {
          valid: false,
          error: `Insufficient ${resource}: need ${amount}, have ${available}`,
        };
      }
    }
    return { valid: true };
  }

  /**
   * Validate resource limits
   */
  static withinLimits(
    resources: Record<string, number>,
    limits: Record<string, number>
  ): MoveValidationResult {
    for (const [resource, amount] of Object.entries(resources)) {
      const limit = limits[resource];
      if (limit !== undefined && amount > limit) {
        return { valid: false, error: `${resource} exceeds limit of ${limit}` };
      }
    }
    return { valid: true };
  }
}

/**
 * Utility functions for common validation patterns
 */
export class ValidationUtils {
  /**
   * Create a validator for board games
   */
  static createBoardValidator(boardSize: number, emptyValue: any = null) {
    return {
      validateMove: (
        moveData: Record<string, any>,
        currentPlayer: string,
        gameOver: boolean,
        board?: any[][]
      ) =>
        BoardValidators.standardMove(
          moveData,
          boardSize,
          currentPlayer,
          gameOver,
          board,
          emptyValue
        ),

      validatePosition: (row: number, col: number) => Validators.boardPosition(row, col, boardSize),

      validateEmpty: (board: any[][], row: number, col: number) =>
        Validators.emptyCell(board, row, col, emptyValue),
    };
  }

  /**
   * Create a validator for card games
   */
  static createCardValidator() {
    return {
      validatePlay: (
        moveData: Record<string, any>,
        playerHand: any[],
        currentPlayer: string,
        gameOver: boolean
      ) => CardValidators.standardPlay(moveData, playerHand, currentPlayer, gameOver),

      validateCard: (
        card: { suit?: string; rank?: string; value?: number },
        criteria: { suit?: string; rank?: string; value?: number }
      ) => CardValidators.cardMatches(card, criteria),
    };
  }

  /**
   * Create a validator for turn-based games
   */
  static createTurnValidator(validPlayers: string[]) {
    return {
      validateTurn: (player: string, currentPlayer: string, gameOver: boolean) =>
        ValidationChain.create()
          .add(Validators.gameNotOver(gameOver))
          .add(Validators.validPlayer(player, validPlayers))
          .add(Validators.playerTurn(player, currentPlayer))
          .validate(),

      validatePlayer: (player: string) => Validators.validPlayer(player, validPlayers),
    };
  }
}

/**
 * Type-safe validation builder
 */
export class ValidationBuilder<T extends Record<string, any>> {
  private validators: Array<(_data: T) => MoveValidationResult> = [];

  static for<T extends Record<string, any>>(): ValidationBuilder<T> {
    return new ValidationBuilder<T>();
  }

  required<K extends keyof T>(field: K): this {
    this.validators.push(_data => {
      if (!(field in _data) || _data[field] === undefined || _data[field] === null) {
        return { valid: false, error: `Missing required field: ${String(field)}` };
      }
      return { valid: true };
    });
    return this;
  }

  custom(validator: (_data: T) => MoveValidationResult): this {
    this.validators.push(validator);
    return this;
  }

  validate(_data: T): MoveValidationResult {
    for (const validator of this.validators) {
      const result = validator(_data);
      if (!result.valid) {
        return result;
      }
    }
    return { valid: true };
  }
}

/**
 * Async validation support
 */
export class AsyncValidationChain {
  private validators: Array<() => Promise<MoveValidationResult>> = [];

  add(validator: () => Promise<MoveValidationResult>): this {
    this.validators.push(validator);
    return this;
  }

  async validate(): Promise<MoveValidationResult> {
    for (const validator of this.validators) {
      const result = await validator();
      if (!result.valid) {
        return result;
      }
    }
    return { valid: true };
  }

  static create(): AsyncValidationChain {
    return new AsyncValidationChain();
  }
}
