/**
 * Game mixins and helpers for common patterns
 * These provide reusable functionality for different game types
 * to reduce boilerplate and improve consistency
 */

import type { MoveValidationResult, GameMetadata, GameState } from '../types/game.js';
import { ERROR_MESSAGES, DIRECTIONS, Position } from './game-constants.js';

/**
 * Board Game Mixin
 * Provides common functionality for board-based games
 */
export class BoardGameMixin {
  /**
   * Validate a board move with common checks
   */
  static validateBoardMove(
    moveData: Record<string, any>,
    boardSize: number,
    currentPlayer: string,
    gameOver: boolean,
    board?: any[][]
  ): MoveValidationResult {
    // Check if game is over
    if (gameOver) {
      return { valid: false, error: ERROR_MESSAGES.GAME_OVER };
    }

    // Validate required fields
    if (!moveData.player || typeof moveData.row !== 'number' || typeof moveData.col !== 'number') {
      return { valid: false, error: ERROR_MESSAGES.MISSING_REQUIRED_FIELDS };
    }

    // Check player turn
    if (moveData.player !== currentPlayer) {
      return { valid: false, error: ERROR_MESSAGES.NOT_YOUR_TURN };
    }

    // Validate position bounds
    if (
      moveData.row < 0 ||
      moveData.row >= boardSize ||
      moveData.col < 0 ||
      moveData.col >= boardSize
    ) {
      return { valid: false, error: ERROR_MESSAGES.INVALID_POSITION };
    }

    // Check if cell is empty (if board provided)
    if (board && board[moveData.row]?.[moveData.col] !== null) {
      return { valid: false, error: 'Cell is already occupied' };
    }

    return { valid: true };
  }

  /**
   * Check for line wins (horizontal, vertical, diagonal)
   */
  static checkLineWin<T>(board: T[][], player: T, winLength: number = 3): boolean {
    const rows = board.length;
    const cols = board[0]?.length || 0;

    // Check horizontal lines
    for (let row = 0; row < rows; row++) {
      for (let col = 0; col <= cols - winLength; col++) {
        if (this.checkLine(board, player, row, col, 0, 1, winLength)) {
          return true;
        }
      }
    }

    // Check vertical lines
    for (let row = 0; row <= rows - winLength; row++) {
      for (let col = 0; col < cols; col++) {
        if (this.checkLine(board, player, row, col, 1, 0, winLength)) {
          return true;
        }
      }
    }

    // Check diagonal lines (top-left to bottom-right)
    for (let row = 0; row <= rows - winLength; row++) {
      for (let col = 0; col <= cols - winLength; col++) {
        if (this.checkLine(board, player, row, col, 1, 1, winLength)) {
          return true;
        }
      }
    }

    // Check diagonal lines (top-right to bottom-left)
    for (let row = 0; row <= rows - winLength; row++) {
      for (let col = winLength - 1; col < cols; col++) {
        if (this.checkLine(board, player, row, col, 1, -1, winLength)) {
          return true;
        }
      }
    }

    return false;
  }

  /**
   * Check a specific line for a win condition
   */
  private static checkLine<T>(
    board: T[][],
    player: T,
    startRow: number,
    startCol: number,
    deltaRow: number,
    deltaCol: number,
    length: number
  ): boolean {
    for (let i = 0; i < length; i++) {
      const row = startRow + i * deltaRow;
      const col = startCol + i * deltaCol;

      if (board[row]?.[col] !== player) {
        return false;
      }
    }
    return true;
  }

  /**
   * Check if board is full
   */
  static isBoardFull<T>(board: T[][], emptyValue: T = null as T): boolean {
    return board.every(row => row?.every(cell => cell !== emptyValue) ?? false);
  }

  /**
   * Get valid moves for a position
   */
  static getValidMoves(
    board: any[][],
    row: number,
    col: number,
    directions: Position[] = Object.values(DIRECTIONS)
  ): Position[] {
    const validMoves: Position[] = [];
    const boardSize = board.length;

    for (const direction of directions) {
      const newRow = row + direction.row;
      const newCol = col + direction.col;

      if (newRow >= 0 && newRow < boardSize && newCol >= 0 && newCol < board[0]!.length) {
        validMoves.push({ row: newRow, col: newCol });
      }
    }

    return validMoves;
  }

  /**
   * Count pieces for a player
   */
  static countPieces<T>(board: T[][], player: T): number {
    let count = 0;
    for (const row of board) {
      for (const cell of row) {
        if (cell === player) {
          count++;
        }
      }
    }
    return count;
  }
}

/**
 * Card Game Mixin
 * Provides common functionality for card-based games
 */
export class CardGameMixin {
  /**
   * Validate a card play move
   */
  static validateCardMove(
    moveData: Record<string, any>,
    playerHand: any[],
    currentPlayer: string,
    gameOver: boolean
  ): MoveValidationResult {
    // Check if game is over
    if (gameOver) {
      return { valid: false, error: ERROR_MESSAGES.GAME_OVER };
    }

    // Validate required fields
    if (!moveData.player || (!moveData.cardIndex && moveData.cardIndex !== 0)) {
      return { valid: false, error: ERROR_MESSAGES.MISSING_REQUIRED_FIELDS };
    }

    // Check player turn
    if (moveData.player !== currentPlayer) {
      return { valid: false, error: ERROR_MESSAGES.NOT_YOUR_TURN };
    }

    // Validate card index
    if (moveData.cardIndex < 0 || moveData.cardIndex >= playerHand.length) {
      return { valid: false, error: 'Invalid card index' };
    }

    return { valid: true };
  }

  /**
   * Deal cards to players
   */
  static dealCards<T>(
    deck: T[],
    playerCount: number,
    cardsPerPlayer: number
  ): { hands: T[][]; remainingDeck: T[] } {
    const hands: T[][] = Array(playerCount)
      .fill(null)
      .map(() => []);
    const deckCopy = [...deck];

    for (let i = 0; i < cardsPerPlayer; i++) {
      for (let player = 0; player < playerCount; player++) {
        const card = deckCopy.pop();
        if (card) {
          hands[player]!.push(card);
        }
      }
    }

    return { hands, remainingDeck: deckCopy };
  }

  /**
   * Check if a card matches suit or rank
   */
  static cardMatches(
    card: { suit: string; rank: string },
    targetSuit?: string,
    targetRank?: string
  ): boolean {
    return (
      (targetSuit ? card.suit === targetSuit : true) &&
      (targetRank ? card.rank === targetRank : true)
    );
  }

  /**
   * Sort hand by suit and rank
   */
  static sortHand(
    hand: Array<{ suit: string; rank: string; value: number }>
  ): Array<{ suit: string; rank: string; value: number }> {
    return [...hand].sort((a, b) => {
      if (a.suit !== b.suit) {
        return a.suit.localeCompare(b.suit);
      }
      return a.value - b.value;
    });
  }

  /**
   * Check for sets (same rank)
   */
  static findSets(hand: Array<{ rank: string }>): Array<{ rank: string; count: number }> {
    const rankCounts = new Map<string, number>();

    for (const card of hand) {
      rankCounts.set(card.rank, (rankCounts.get(card.rank) || 0) + 1);
    }

    return Array.from(rankCounts.entries())
      .filter(([, count]) => count >= 2)
      .map(([rank, count]) => ({ rank, count }));
  }

  /**
   * Check for runs (consecutive ranks)
   */
  static findRuns(
    hand: Array<{ rank: string; value: number }>,
    minLength: number = 3
  ): Array<{ cards: Array<{ rank: string; value: number }>; length: number }> {
    const sortedHand = [...hand].sort((a, b) => a.value - b.value);
    const runs: Array<{ cards: Array<{ rank: string; value: number }>; length: number }> = [];

    let currentRun: Array<{ rank: string; value: number }> = [];

    for (const card of sortedHand) {
      if (currentRun.length === 0 || card.value === currentRun[currentRun.length - 1]!.value + 1) {
        currentRun.push(card);
      } else {
        if (currentRun.length >= minLength) {
          runs.push({ cards: [...currentRun], length: currentRun.length });
        }
        currentRun = [card];
      }
    }

    if (currentRun.length >= minLength) {
      runs.push({ cards: currentRun, length: currentRun.length });
    }

    return runs;
  }
}

/**
 * Turn-Based Game Mixin
 * Provides common functionality for turn-based games
 */
export class TurnBasedMixin {
  /**
   * Advance to next player
   */
  static getNextPlayer(playerOrder: string[], currentPlayer: string): string {
    const currentIndex = playerOrder.indexOf(currentPlayer);
    if (currentIndex === -1) {
      return playerOrder[0] || currentPlayer;
    }

    const nextIndex = (currentIndex + 1) % playerOrder.length;
    return playerOrder[nextIndex] || currentPlayer;
  }

  /**
   * Get previous player
   */
  static getPreviousPlayer(playerOrder: string[], currentPlayer: string): string {
    const currentIndex = playerOrder.indexOf(currentPlayer);
    if (currentIndex === -1) {
      return playerOrder[playerOrder.length - 1] || currentPlayer;
    }

    const prevIndex = currentIndex === 0 ? playerOrder.length - 1 : currentIndex - 1;
    return playerOrder[prevIndex] || currentPlayer;
  }

  /**
   * Check if it's a specific player's turn
   */
  static isPlayerTurn(player: string, currentPlayer: string): boolean {
    return player === currentPlayer;
  }

  /**
   * Validate turn order
   */
  static validateTurn(
    moveData: Record<string, any>,
    currentPlayer: string,
    gameOver: boolean
  ): MoveValidationResult {
    if (gameOver) {
      return { valid: false, error: ERROR_MESSAGES.GAME_OVER };
    }

    if (!moveData.player) {
      return { valid: false, error: ERROR_MESSAGES.MISSING_REQUIRED_FIELDS };
    }

    if (moveData.player !== currentPlayer) {
      return { valid: false, error: ERROR_MESSAGES.NOT_YOUR_TURN };
    }

    return { valid: true };
  }

  /**
   * Create round-robin player order
   */
  static createPlayerOrder(players: string[]): string[] {
    return [...players];
  }

  /**
   * Shuffle player order
   */
  static shufflePlayerOrder(players: string[]): string[] {
    const shuffled = [...players];
    for (let i = shuffled.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [shuffled[i]!, shuffled[j]!] = [shuffled[j]!, shuffled[i]!];
    }
    return shuffled;
  }
}

/**
 * Scoring Mixin
 * Provides common functionality for games with scoring
 */
export class ScoringMixin {
  /**
   * Initialize player scores
   */
  static initializeScores(players: string[], initialScore: number = 0): Record<string, number> {
    const scores: Record<string, number> = {};
    for (const player of players) {
      scores[player] = initialScore;
    }
    return scores;
  }

  /**
   * Add points to a player's score
   */
  static addScore(
    scores: Record<string, number>,
    player: string,
    points: number
  ): Record<string, number> {
    return {
      ...scores,
      [player]: (scores[player] || 0) + points,
    };
  }

  /**
   * Get player rankings by score
   */
  static getRankings(
    scores: Record<string, number>
  ): Array<{ player: string; score: number; rank: number }> {
    const sortedEntries = Object.entries(scores).sort(([, a], [, b]) => b - a);

    return sortedEntries.map(([player, score], index) => ({
      player,
      score,
      rank: index + 1,
    }));
  }

  /**
   * Get the winner (highest score)
   */
  static getWinner(scores: Record<string, number>): string | null {
    const rankings = this.getRankings(scores);
    return rankings[0]?.player || null;
  }

  /**
   * Check if there's a tie for first place
   */
  static hasTie(scores: Record<string, number>): boolean {
    const rankings = this.getRankings(scores);
    return rankings.length >= 2 && rankings[0]!.score === rankings[1]!.score;
  }

  /**
   * Get players with the highest score
   */
  static getWinners(scores: Record<string, number>): string[] {
    const rankings = this.getRankings(scores);
    if (rankings.length === 0) {
      return [];
    }

    const highestScore = rankings[0]!.score;
    return rankings.filter(({ score }) => score === highestScore).map(({ player }) => player);
  }
}

/**
 * Game Metadata Builder
 * Helps create consistent metadata for games
 */
export class GameMetadataBuilder {
  private metadata: Partial<GameMetadata> = {};

  static create(): GameMetadataBuilder {
    return new GameMetadataBuilder();
  }

  name(name: string): this {
    this.metadata.name = name;
    return this;
  }

  description(description: string): this {
    this.metadata.description = description;
    return this;
  }

  players(min: number, max: number = min): this {
    this.metadata.minPlayers = min;
    this.metadata.maxPlayers = max;
    return this;
  }

  duration(estimatedDuration: string): this {
    this.metadata.estimatedDuration = estimatedDuration;
    return this;
  }

  complexity(complexity: 'beginner' | 'intermediate' | 'advanced' | 'expert'): this {
    this.metadata.complexity = complexity === 'expert' ? 'advanced' : complexity;
    return this;
  }

  categories(...categories: string[]): this {
    this.metadata.categories = categories;
    return this;
  }

  build(): GameMetadata {
    const { name, description, minPlayers, maxPlayers, estimatedDuration, complexity, categories } =
      this.metadata;

    if (
      !name ||
      !description ||
      !minPlayers ||
      !maxPlayers ||
      !estimatedDuration ||
      !complexity ||
      !categories
    ) {
      throw new Error('Missing required metadata fields');
    }

    return {
      name,
      description,
      minPlayers,
      maxPlayers,
      estimatedDuration,
      complexity,
      categories,
    };
  }
}

/**
 * Common game state patterns
 */
export interface StandardBoardGameState<TPlayer extends string = string, TCell = any> {
   board: TCell[][];
   currentPlayer: TPlayer;
   gameOver: boolean;
   winner: TPlayer | 'draw' | null;
   playerOrder: TPlayer[];
   status: string;
}

export interface StandardCardGameState<TPlayer extends string = string> {
   hands: Record<TPlayer, any[]>;
   deck: any[];
   discardPile: any[];
   currentPlayer: TPlayer;
   gameOver: boolean;
   winner: TPlayer | null;
   playerOrder: TPlayer[];
   status: string;
}

export interface StandardScoredGameState<TPlayer extends string = string> {
   scores: Record<TPlayer, number>;
   currentPlayer: TPlayer;
   gameOver: boolean;
   winner: TPlayer | null;
   playerOrder: TPlayer[];
   round: number;
   status: string;
}

/**
 * Type helpers for better type inference
 */
export type ExtractPlayer<T> =
  T extends StandardBoardGameState<infer P>
    ? P
    : T extends StandardCardGameState<infer P>
      ? P
      : T extends StandardScoredGameState<infer P>
        ? P
        : string;

export type ExtractCell<T> = T extends StandardBoardGameState<any, infer C> ? C : any;
