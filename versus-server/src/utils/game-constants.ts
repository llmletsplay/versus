/**
 * Shared constants and utilities for game implementations
 * This file provides common constants, types, and helper functions
 * to improve consistency and reduce duplication across games.
 */

// Common board sizes used across games
export const BOARD_SIZES = {
  SMALL: 8, // Chess, Checkers
  MEDIUM: 15, // Word Tiles, Go (small)
  LARGE: 19, // Go (standard)
  EXTRA_LARGE: 21, // Some variants
} as const;

// Common player counts
export const PLAYER_COUNTS = {
  TWO: 2,
  THREE: 3,
  FOUR: 4,
  SIX: 6,
  EIGHT: 8,
  TEN: 10,
} as const;

// Common game phases
export const GAME_PHASES = {
  WAITING: 'waiting',
  PLAYING: 'playing',
  PAUSED: 'paused',
  FINISHED: 'finished',
  SCORING: 'scoring',
} as const;

// Common game complexities
export const COMPLEXITIES = {
  BEGINNER: 'beginner',
  INTERMEDIATE: 'intermediate',
  ADVANCED: 'advanced',
  EXPERT: 'expert',
} as const;

// Common game categories
export const CATEGORIES = {
  STRATEGY: 'strategy',
  CARD: 'card',
  BOARD: 'board',
  WORD: 'word',
  CLASSIC: 'classic',
  FAMILY: 'family',
  PARTY: 'party',
  ABSTRACT: 'abstract',
  LUCK: 'luck',
  SOCIAL: 'social',
} as const;

// Standard card suits and ranks
export const CARD_SUITS = ['hearts', 'diamonds', 'clubs', 'spades'] as const;
export const CARD_RANKS = [
  'A',
  '2',
  '3',
  '4',
  '5',
  '6',
  '7',
  '8',
  '9',
  '10',
  'J',
  'Q',
  'K',
] as const;

// Common directions for board games
export const DIRECTIONS = {
  UP: { row: -1, col: 0 },
  DOWN: { row: 1, col: 0 },
  LEFT: { row: 0, col: -1 },
  RIGHT: { row: 0, col: 1 },
  UP_LEFT: { row: -1, col: -1 },
  UP_RIGHT: { row: -1, col: 1 },
  DOWN_LEFT: { row: 1, col: -1 },
  DOWN_RIGHT: { row: 1, col: 1 },
} as const;

// Common validation error messages
export const ERROR_MESSAGES = {
  GAME_OVER: 'Game is already over',
  NOT_YOUR_TURN: 'Not your turn',
  INVALID_PLAYER: 'Invalid player',
  INVALID_MOVE: 'Invalid move',
  INVALID_POSITION: 'Invalid board position',
  MISSING_REQUIRED_FIELDS: 'Move must include required fields',
  INSUFFICIENT_RESOURCES: 'Insufficient resources for this action',
} as const;

/**
 * Helper function to validate board position
 */
export function isValidPosition(row: number, col: number, boardSize: number): boolean {
  return row >= 0 && row < boardSize && col >= 0 && col < boardSize;
}

/**
 * Helper function to get adjacent positions
 */
export function getAdjacentPositions(
  row: number,
  col: number,
  boardSize: number,
  includeDiagonals = false
): Array<{ row: number; col: number }> {
  const positions: Array<{ row: number; col: number }> = [];
  const directions = includeDiagonals
    ? Object.values(DIRECTIONS)
    : [DIRECTIONS.UP, DIRECTIONS.DOWN, DIRECTIONS.LEFT, DIRECTIONS.RIGHT];

  for (const direction of directions) {
    const newRow = row + direction.row;
    const newCol = col + direction.col;

    if (isValidPosition(newRow, newCol, boardSize)) {
      positions.push({ row: newRow, col: newCol });
    }
  }

  return positions;
}

/**
 * Helper function to shuffle an array using Fisher-Yates algorithm
 */
export function shuffleArray<T>(array: T[]): void {
  for (let i = array.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [array[i]!, array[j]!] = [array[j]!, array[i]!];
  }
}

/**
 * Helper function to create a standard deck of cards
 */
export function createStandardDeck(): Array<{ suit: string; rank: string; value: number }> {
  const deck: Array<{ suit: string; rank: string; value: number }> = [];

  for (const suit of CARD_SUITS) {
    for (let i = 0; i < CARD_RANKS.length; i++) {
      const rank = CARD_RANKS[i]!;
      let value: number;

      // Standard card values (Ace = 1, Face cards = 10)
      if (rank === 'A') {
        value = 1;
      } else if (['J', 'Q', 'K'].includes(rank)) {
        value = 10;
      } else {
        value = parseInt(rank);
      }

      deck.push({ suit, rank, value });
    }
  }

  return deck;
}

/**
 * Helper function to calculate distance between two positions
 */
export function calculateDistance(
  pos1: { row: number; col: number },
  pos2: { row: number; col: number }
): number {
  return Math.abs(pos1.row - pos2.row) + Math.abs(pos1.col - pos2.col);
}

/**
 * Helper function to generate unique ID
 */
export function generateId(prefix = ''): string {
  const timestamp = Date.now().toString(36);
  const randomPart = Math.random().toString(36).substr(2, 5);
  return prefix ? `${prefix}-${timestamp}-${randomPart}` : `${timestamp}-${randomPart}`;
}

/**
 * Type guard to check if a value is defined
 */
export function isDefined<T>(value: T | undefined | null): value is T {
  return value !== undefined && value !== null;
}

/**
 * Helper to clamp a value between min and max
 */
export function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max);
}

/**
 * Helper to get random element from array
 */
export function getRandomElement<T>(array: T[]): T | undefined {
  if (array.length === 0) {
    return undefined;
  }
  return array[Math.floor(Math.random() * array.length)];
}

/**
 * Helper to chunk array into smaller arrays
 */
export function chunkArray<T>(array: T[], chunkSize: number): T[][] {
  const chunks: T[][] = [];
  for (let i = 0; i < array.length; i += chunkSize) {
    chunks.push(array.slice(i, i + chunkSize));
  }
  return chunks;
}

/**
 * Common type definitions for better type safety
 */
export type Position = { row: number; col: number };
export type Direction = (typeof DIRECTIONS)[keyof typeof DIRECTIONS];
export type GamePhase = (typeof GAME_PHASES)[keyof typeof GAME_PHASES];
export type Complexity = (typeof COMPLEXITIES)[keyof typeof COMPLEXITIES];
export type Category = (typeof CATEGORIES)[keyof typeof CATEGORIES];
export type CardSuit = (typeof CARD_SUITS)[number];
export type CardRank = (typeof CARD_RANKS)[number];

/**
 * Common interfaces for game development
 */
export interface GameTimer {
  startTime: number;
  timeLimit?: number;
  timeRemaining?: number;
  isPaused: boolean;
}

export interface PlayerStats {
  gamesPlayed: number;
  gamesWon: number;
  totalScore: number;
  averageScore: number;
  winRate: number;
}

export interface GameSettings {
  timeLimit?: number;
  allowUndo?: boolean;
  showHints?: boolean;
  difficulty?: Complexity;
  customRules?: Record<string, any>;
}

/**
 * Validation helpers for common game patterns
 */
export class GameValidators {
  static validatePlayerCount(count: number, min: number, max: number): boolean {
    return count >= min && count <= max;
  }

  static validateTimeLimit(timeLimit: number): boolean {
    return timeLimit > 0 && timeLimit <= 7200; // Max 2 hours
  }

  static validatePosition(pos: Position, boardSize: number): boolean {
    return isValidPosition(pos.row, pos.col, boardSize);
  }

  static validateMoveFormat(move: any, requiredFields: string[]): boolean {
    return requiredFields.every(field => move && typeof move[field] !== 'undefined');
  }
}

/**
 * Common scoring utilities
 */
export class ScoringUtils {
  static calculatePercentage(value: number, total: number): number {
    if (total === 0) {
      return 0;
    }
    return Math.round((value / total) * 100);
  }

  static calculateAverage(values: number[]): number {
    if (values.length === 0) {
      return 0;
    }
    return values.reduce((sum, val) => sum + val, 0) / values.length;
  }

  static findHighestScore(
    scores: Record<string, number>
  ): { player: string; score: number } | null {
    const entries = Object.entries(scores);
    if (entries.length === 0) {
      return null;
    }

    const [player, score] = entries.reduce((max, current) => (current[1] > max[1] ? current : max));

    return { player, score };
  }

  static rankPlayers(
    scores: Record<string, number>
  ): Array<{ player: string; score: number; rank: number }> {
    const sorted = Object.entries(scores)
      .sort(([, a], [, b]) => b - a)
      .map(([player, score], index) => ({ player, score, rank: index + 1 }));

    return sorted;
  }
}
