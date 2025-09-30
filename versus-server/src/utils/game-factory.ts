import type { GameConfig, MoveValidationResult, GameMetadata } from '../types/game.js';
import { BaseGame } from '../core/base-game.js';
import { DatabaseProvider } from '../core/database.js';

/**
 * Game Factory - Simplifies creation of new games
 * Provides templates and utilities for common game patterns
 */

// Common game templates
export interface GameTemplate {
  name: string;
  description: string;
  minPlayers: number;
  maxPlayers: number;
  complexity: 'beginner' | 'easy' | 'medium' | 'advanced' | 'expert';
  categories: string[];
  estimatedDuration: string;
}

// Board game template
export interface BoardGameConfig extends GameConfig {
  boardSize?: number;
  rows?: number;
  cols?: number;
  initialValue?: any;
}

// Card game template
export interface CardGameConfig extends GameConfig {
  deckType?: 'standard' | 'custom';
  handSize?: number;
  includeJokers?: boolean;
}

// Turn-based game template
export interface TurnBasedGameConfig extends GameConfig {
  turnTimeLimit?: number;
  maxTurns?: number;
}

/**
 * Abstract factory for board games
 */
export abstract class BoardGameFactory extends BaseGame {
  protected board: any[][];
  protected boardSize: { rows: number; cols: number };

  constructor(gameId: string, gameType: string, database: DatabaseProvider, config?: BoardGameConfig) {
    super(gameId, gameType, database);
    this.boardSize = {
      rows: config?.rows || config?.boardSize || 8,
      cols: config?.cols || config?.boardSize || 8,
    };
    this.board = this.createEmptyBoard(config?.initialValue);
  }

  protected createEmptyBoard(initialValue: any = null): any[][] {
    return Array(this.boardSize.rows)
      .fill(null)
      .map(() => Array(this.boardSize.cols).fill(initialValue));
  }

  protected isValidPosition(row: number, col: number): boolean {
    return row >= 0 && row < this.boardSize.rows && col >= 0 && col < this.boardSize.cols;
  }

  protected isEmpty(row: number, col: number): boolean {
    return this.board[row]?.[col] === null;
  }

  protected getNeighbors(row: number, col: number): Array<{ row: number; col: number }> {
    const neighbors = [];
    const directions = [
      [-1, -1],
      [-1, 0],
      [-1, 1],
      [0, -1],
      [0, 1],
      [1, -1],
      [1, 0],
      [1, 1],
    ];

    for (const [dr, dc] of directions) {
      const newRow = row + dr!;
      const newCol = col + dc!;
      if (this.isValidPosition(newRow, newCol)) {
        neighbors.push({ row: newRow, col: newCol });
      }
    }
    return neighbors;
  }

  protected checkLine(row: number, col: number, player: string, length: number = 4): boolean {
    const directions = [
      [0, 1],
      [1, 0],
      [1, 1],
      [1, -1],
    ]; // horizontal, vertical, diagonal

    for (const direction of directions) {
      const [dr = 0, dc = 0] = direction;
      let count = 1;

      // Check forward direction
      for (let i = 1; i < length; i++) {
        const newRow = row + i * dr;
        const newCol = col + i * dc;
        if (this.isValidPosition(newRow, newCol) && this.board[newRow]?.[newCol] === player) {
          count++;
        } else {
          break;
        }
      }

      // Check backward direction
      for (let i = 1; i < length; i++) {
        const newRow = row - i * dr;
        const newCol = col - i * dc;
        if (this.isValidPosition(newRow, newCol) && this.board[newRow]?.[newCol] === player) {
          count++;
        } else {
          break;
        }
      }

      if (count >= length) {
        return true;
      }
    }
    return false;
  }
}

/**
 * Abstract factory for card games
 */
export abstract class CardGameFactory extends BaseGame {
  protected deck: any[];
  protected hands: Map<string, any[]>;
  protected discardPile: any[];

  constructor(gameId: string, gameType: string, database: DatabaseProvider, _config?: CardGameConfig) {
    super(gameId, gameType, database);
    this.hands = new Map();
    this.discardPile = [];
    this.deck = this.createDeck(_config);
  }

  protected abstract createDeck(_config?: CardGameConfig): any[];

  protected shuffleDeck(): void {
    this.deck = this.shuffleArray(this.deck);
  }

  protected dealCards(playerIds: string[], cardsPerPlayer: number): void {
    for (let i = 0; i < cardsPerPlayer; i++) {
      for (const playerId of playerIds) {
        if (this.deck.length > 0) {
          const card = this.deck.pop()!;
          if (!this.hands.has(playerId)) {
            this.hands.set(playerId, []);
          }
          this.hands.get(playerId)!.push(card);
        }
      }
    }
  }

  protected drawCard(playerId: string): any | null {
    if (this.deck.length === 0) {
      this.reshuffleDeck();
    }

    if (this.deck.length > 0) {
      const card = this.deck.pop()!;
      if (!this.hands.has(playerId)) {
        this.hands.set(playerId, []);
      }
      this.hands.get(playerId)!.push(card);
      return card;
    }
    return null;
  }

  protected playCard(playerId: string, cardIndex: number): any | null {
    const hand = this.hands.get(playerId);
    if (hand && cardIndex >= 0 && cardIndex < hand.length) {
      const card = hand.splice(cardIndex, 1)[0];
      this.discardPile.push(card);
      return card;
    }
    return null;
  }

  protected reshuffleDeck(): void {
    if (this.discardPile.length > 0) {
      this.deck = [...this.discardPile];
      this.discardPile = [];
      this.shuffleDeck();
    }
  }

  protected hasCard(playerId: string, card: any): boolean {
    const hand = this.hands.get(playerId);
    return hand ? hand.some(c => this.cardsEqual(c, card)) : false;
  }

  protected abstract cardsEqual(_card1: any, _card2: any): boolean;
}

/**
 * Abstract factory for turn-based games
 */
export abstract class TurnBasedGameFactory extends BaseGame {
  protected currentPlayer: string;
  protected playerOrder: string[];
  protected turnCount: number;
  protected maxTurns?: number;

  constructor(gameId: string, gameType: string, database: DatabaseProvider, config?: TurnBasedGameConfig) {
    super(gameId, gameType, database);
    this.playerOrder = [];
    this.currentPlayer = '';
    this.turnCount = 0;
    this.maxTurns = config?.maxTurns;
  }

  protected initializePlayers(playerIds: string[]): void {
    this.playerOrder = [...playerIds];
    this.currentPlayer = playerIds[0] || '';
  }

  protected nextTurn(): void {
    const currentIndex = this.playerOrder.indexOf(this.currentPlayer);
    this.currentPlayer = this.playerOrder[(currentIndex + 1) % this.playerOrder.length] || '';
    this.turnCount++;
  }

  protected isCurrentPlayer(playerId: string): boolean {
    return this.currentPlayer === playerId;
  }

  protected validateTurn(playerId: string): MoveValidationResult {
    if (!this.isCurrentPlayer(playerId)) {
      return { valid: false, error: `It's ${this.currentPlayer}'s turn` };
    }
    return { valid: true };
  }

  protected isMaxTurnsReached(): boolean {
    return this.maxTurns !== undefined && this.turnCount >= this.maxTurns;
  }
}

/**
 * Game creation helpers
 */
export class GameCreationHelper {
  static createBoardGameMetadata(template: Partial<GameTemplate>): GameMetadata {
    return {
      name: template.name || 'Untitled Board Game',
      description: template.description || 'A board game',
      minPlayers: template.minPlayers || 2,
      maxPlayers: template.maxPlayers || 4,
      estimatedDuration: template.estimatedDuration || '30 minutes',
      complexity: template.complexity || 'medium',
      categories: template.categories || ['board', 'strategy'],
    };
  }

  static createCardGameMetadata(template: Partial<GameTemplate>): GameMetadata {
    return {
      name: template.name || 'Untitled Card Game',
      description: template.description || 'A card game',
      minPlayers: template.minPlayers || 2,
      maxPlayers: template.maxPlayers || 6,
      estimatedDuration: template.estimatedDuration || '20 minutes',
      complexity: template.complexity || 'easy',
      categories: template.categories || ['card', 'casual'],
    };
  }

  static validateGameConfig(config: GameConfig): MoveValidationResult {
    if (config.playerCount && config.playerCount < 1) {
      return { valid: false, error: 'Player count must be at least 1' };
    }

    if (config.playerCount && config.playerCount > 10) {
      return { valid: false, error: 'Player count cannot exceed 10' };
    }

    return { valid: true };
  }
}

/**
 * Common validation helpers
 */
export class ValidationHelper {
  static requireFields<T>(data: T, fields: (keyof T)[]): MoveValidationResult {
    for (const field of fields) {
      if (!(field in data) || data[field] === undefined || data[field] === null) {
        return { valid: false, error: `Missing required field: ${String(field)}` };
      }
    }
    return { valid: true };
  }

  static validateRange(
    value: number,
    min: number,
    max: number,
    fieldName: string
  ): MoveValidationResult {
    if (value < min || value > max) {
      return { valid: false, error: `${fieldName} must be between ${min} and ${max}` };
    }
    return { valid: true };
  }

  static validateEnum<T>(value: T, allowedValues: T[], fieldName: string): MoveValidationResult {
    if (!allowedValues.includes(value)) {
      return { valid: false, error: `${fieldName} must be one of: ${allowedValues.join(', ')}` };
    }
    return { valid: true };
  }
}

/**
 * Example usage templates
 */
export const GAME_TEMPLATES = {
  SIMPLE_BOARD_GAME: {
    name: 'Simple Board Game',
    description: 'A basic board game template',
    minPlayers: 2,
    maxPlayers: 4,
    complexity: 'easy' as const,
    categories: ['board', 'casual'],
    estimatedDuration: '15-30 minutes',
  },

  STRATEGIC_BOARD_GAME: {
    name: 'Strategic Board Game',
    description: 'A complex strategy game template',
    minPlayers: 2,
    maxPlayers: 4,
    complexity: 'advanced' as const,
    categories: ['board', 'strategy'],
    estimatedDuration: '60-120 minutes',
  },

  CARD_GAME: {
    name: 'Card Game',
    description: 'A standard card game template',
    minPlayers: 2,
    maxPlayers: 6,
    complexity: 'medium' as const,
    categories: ['card', 'casual'],
    estimatedDuration: '20-40 minutes',
  },

  PARTY_GAME: {
    name: 'Party Game',
    description: 'A fun party game template',
    minPlayers: 4,
    maxPlayers: 8,
    complexity: 'easy' as const,
    categories: ['party', 'social'],
    estimatedDuration: '15-30 minutes',
  },
};
