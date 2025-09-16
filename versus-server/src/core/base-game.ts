import { AbstractGame } from '../types/game.js';
import type {
  GameMove,
  GameState,
  GameConfig,
  MoveValidationResult,
  GameMetadata,
} from '../types/game.js';
import { ERROR_MESSAGES, shuffleArray } from '../utils/game-constants.js';
import { logger } from '../utils/logger.js';
import { errorHandler, ValidationErrors } from '../utils/error-handler.js';
import { PlayerManager, PlayerUtils } from '../utils/player-manager.js';
import fs from 'fs/promises';
import path from 'path';

/**
 * Simple, production-ready BaseGame class with generic typing
 * Provides common functionality while keeping the API simple and maintainable
 */
export abstract class BaseGame<TState extends GameState = GameState> extends AbstractGame<TState> {
  protected gameDataPath: string;
  protected playerManager?: PlayerManager;

  constructor(gameId: string, gameType: string, gameDataPath: string = './game_data') {
    super(gameId, gameType);
    this.gameDataPath = gameDataPath;
  }

  /**
   * Initialize the game with configuration
   * Subclasses should override this to set up their initial state
   */
  abstract initializeGame(_config?: GameConfig): Promise<TState>;

  /**
   * Validate a move before applying it
   * Subclasses must implement this to validate game-specific moves
   */
  abstract validateMove(_moveData: Record<string, any>): Promise<MoveValidationResult>;

  /**
   * Apply a validated move to the game state
   * Subclasses must implement this to update their state
   * NOTE: This is called by makeMove() - don't override makeMove, implement this instead
   */
  protected abstract applyMove(_move: GameMove): Promise<void>;

  /**
   * Get the current game state
   * Subclasses must implement this to return their state
   */
  abstract getGameState(): Promise<TState>;

  /**
   * Check if the game is over
   * Subclasses must implement this
   */
  abstract isGameOver(): Promise<boolean>;

  /**
   * Get the winner of the game (if any)
   * Subclasses must implement this
   */
  abstract getWinner(): Promise<string | null>;

  /**
   * Get metadata about the game
   * Subclasses must implement this
   */
  abstract getMetadata(): GameMetadata;

  /**
   * Make a move in the game
   * This handles validation, application, and persistence
   * NOTE: Games should implement applyMove(), not override this method
   */
  async makeMove(moveData: Record<string, any>): Promise<TState> {
    const context = {
      gameId: this.gameId,
      gameType: this.gameType,
      player: moveData.player,
      action: 'makeMove',
    };

    try {
      // Validate the move
      const validation = await this.validateMove(moveData);
      if (!validation.valid) {
        throw ValidationErrors.invalidMoveFormat({
          ...context,
          details: { error: validation.error, moveData },
        });
      }

      // Check if game is already over
      if (await this.isGameOver()) {
        throw ValidationErrors.gameAlreadyOver(context);
      }

      // Create the move object
      const move: GameMove = {
        player: moveData.player || this.currentState.currentPlayer,
        moveData,
        timestamp: Date.now(),
      };

      // Log the move
      logger.gameAction('makeMove', this.gameId, this.gameType, move.player, moveData);

      // Apply the move
      await this.applyMove(move);

      // Add to history and persist
      await this.addMove(move);

      return this.getGameState();
    } catch (error) {
      // Handle and re-throw with proper context
      const gameError = errorHandler.handleError(error as Error, context);
      throw gameError;
    }
  }

  /**
   * Enhanced state persistence with error handling
   */
  protected async persistState(): Promise<void> {
    try {
      const gameData = {
        gameId: this.gameId,
        gameType: this.gameType,
        history: this.history,
        currentState: this.currentState,
        timestamp: Date.now(),
      };

      const filePath = path.join(this.gameDataPath, `${this.gameId}.json`);

      await fs.mkdir(this.gameDataPath, { recursive: true });
      await fs.writeFile(filePath, JSON.stringify(gameData, null, 2));

      logger.debug('Game state persisted', {
        gameId: this.gameId,
        gameType: this.gameType,
        filePath,
      });
    } catch (error) {
      const context = {
        gameId: this.gameId,
        gameType: this.gameType,
        action: 'persistState',
      };
      const gameError = errorHandler.handleError(error as Error, context);
      throw gameError;
    }
  }

  /**
   * Enhanced state loading with error handling
   */
  protected async loadState(): Promise<void> {
    try {
      const filePath = path.join(this.gameDataPath, `${this.gameId}.json`);

      const data = await fs.readFile(filePath, 'utf-8');
      const gameData = JSON.parse(data);

      // Validate that the loaded data matches this game
      if (gameData.gameId !== this.gameId || gameData.gameType !== this.gameType) {
        throw new Error('Game data mismatch');
      }

      this.history = gameData.history || [];
      this.currentState = gameData.currentState || {};

      logger.debug('Game state loaded', {
        gameId: this.gameId,
        gameType: this.gameType,
        filePath,
        historyLength: this.history.length,
      });
    } catch (error: any) {
      if (error.code === 'ENOENT') {
        // File doesn't exist, this is a new game
        this.history = [];
        this.currentState = {} as TState;
        logger.debug('New game initialized', {
          gameId: this.gameId,
          gameType: this.gameType,
        });
      } else {
        const context = {
          gameId: this.gameId,
          gameType: this.gameType,
          action: 'loadState',
        };
        const gameError = errorHandler.handleError(error as Error, context);
        throw gameError;
      }
    }
  }

  // ========================================
  // Common Helper Methods
  // ========================================

  /**
   * Helper for common move validation patterns
   */
  protected validateCommonMove(
    moveData: Record<string, any>,
    requiredFields: string[] = ['player']
  ): MoveValidationResult {
    // Check required fields
    for (const field of requiredFields) {
      if (!(field in moveData) || moveData[field] === undefined || moveData[field] === null) {
        return { valid: false, error: `Missing required field: ${field}` };
      }
    }

    return { valid: true };
  }

  /**
   * Helper to validate player turn
   */
  protected validatePlayerTurn(player: string, currentPlayer: string): MoveValidationResult {
    if (player !== currentPlayer) {
      return { valid: false, error: ERROR_MESSAGES.NOT_YOUR_TURN };
    }
    return { valid: true };
  }

  /**
   * Helper to validate board position
   */
  protected validatePosition(row: number, col: number, boardSize: number): MoveValidationResult {
    if (row < 0 || row >= boardSize || col < 0 || col >= boardSize) {
      return { valid: false, error: ERROR_MESSAGES.INVALID_POSITION };
    }
    return { valid: true };
  }

  /**
   * Helper to check if a board cell is empty
   */
  protected isCellEmpty(board: any[][], row: number, col: number, emptyValue: any = null): boolean {
    return board[row]?.[col] === emptyValue;
  }

  /**
   * Helper to get adjacent positions (4-directional)
   */
  protected getAdjacentPositions(
    row: number,
    col: number,
    boardSize: number
  ): Array<{ row: number; col: number }> {
    const positions: Array<{ row: number; col: number }> = [];
    const directions = [
      { row: -1, col: 0 }, // up
      { row: 1, col: 0 }, // down
      { row: 0, col: -1 }, // left
      { row: 0, col: 1 }, // right
    ];

    for (const dir of directions) {
      const newRow = row + dir.row;
      const newCol = col + dir.col;

      if (newRow >= 0 && newRow < boardSize && newCol >= 0 && newCol < boardSize) {
        positions.push({ row: newRow, col: newCol });
      }
    }

    return positions;
  }

  /**
   * Helper to get all adjacent positions (8-directional)
   */
  protected getAllAdjacentPositions(
    row: number,
    col: number,
    boardSize: number
  ): Array<{ row: number; col: number }> {
    const positions: Array<{ row: number; col: number }> = [];

    for (let dr = -1; dr <= 1; dr++) {
      for (let dc = -1; dc <= 1; dc++) {
        if (dr === 0 && dc === 0) {
          continue;
        } // skip the center position

        const newRow = row + dr;
        const newCol = col + dc;

        if (newRow >= 0 && newRow < boardSize && newCol >= 0 && newCol < boardSize) {
          positions.push({ row: newRow, col: newCol });
        }
      }
    }

    return positions;
  }

  /**
   * Helper to advance to next player in turn order
   */
  protected advanceToNextPlayer(playerOrder: string[], currentPlayer: string): string {
    const currentIndex = playerOrder.indexOf(currentPlayer);
    if (currentIndex === -1) {
      return playerOrder[0] || currentPlayer;
    }

    const nextIndex = (currentIndex + 1) % playerOrder.length;
    return playerOrder[nextIndex] || currentPlayer;
  }

  /**
   * Helper to shuffle an array (Fisher-Yates)
   */
  protected shuffleArray<T>(array: T[]): T[] {
    const shuffled = [...array];
    shuffleArray(shuffled);
    return shuffled;
  }

  /**
   * Helper to create a standard deck of cards
   */
  protected createStandardDeck(): Array<{ suit: string; rank: string; value: number }> {
    const suits = ['hearts', 'diamonds', 'clubs', 'spades'];
    const ranks = [
      { rank: 'A', value: 1 },
      { rank: '2', value: 2 },
      { rank: '3', value: 3 },
      { rank: '4', value: 4 },
      { rank: '5', value: 5 },
      { rank: '6', value: 6 },
      { rank: '7', value: 7 },
      { rank: '8', value: 8 },
      { rank: '9', value: 9 },
      { rank: '10', value: 10 },
      { rank: 'J', value: 11 },
      { rank: 'Q', value: 12 },
      { rank: 'K', value: 13 },
    ];

    const deck = [];
    for (const suit of suits) {
      for (const { rank, value } of ranks) {
        deck.push({ suit, rank, value });
      }
    }

    return this.shuffleArray(deck);
  }

  /**
   * Helper to check if all elements in array are the same
   */
  protected allSame<T>(array: T[]): boolean {
    return array.length > 0 && array.every(item => item === array[0]);
  }

  /**
   * Helper to count occurrences of value in array
   */
  protected countOccurrences<T>(array: T[], value: T): number {
    return array.filter(item => item === value).length;
  }

  /**
   * Helper to find the most common element in array
   */
  protected findMostCommon<T>(array: T[]): T | null {
    if (array.length === 0) {
      return null;
    }

    const counts = new Map<T, number>();
    for (const item of array) {
      counts.set(item, (counts.get(item) || 0) + 1);
    }

    let maxCount = 0;
    let mostCommon: T | null = null;

    for (const [item, count] of counts) {
      if (count > maxCount) {
        maxCount = count;
        mostCommon = item;
      }
    }

    return mostCommon;
  }

  /**
   * Helper to safely update state
   */
  protected updateState(updates: Partial<Record<string, any>>): void {
    this.currentState = { ...this.currentState, ...updates };
  }

  /**
   * Helper to set game over state
   */
  protected setGameOver(winner: string | null = null): void {
    this.updateState({
      gameOver: true,
      winner,
    });
  }

  /**
   * Helper to get current player from state
   */
  protected getCurrentPlayer(): string | undefined {
    return this.currentState.currentPlayer;
  }

  /**
   * Helper to set current player
   */
  protected setCurrentPlayer(player: string): void {
    this.updateState({ currentPlayer: player });
  }

  // ========================================
  // Standardized Player Management
  // ========================================

  /**
   * Initialize player manager with standard configuration
   */
  protected initializePlayerManager(config: {
    playerIds?: string[];
    playerNames?: string[];
    minPlayers?: number;
    maxPlayers?: number;
    playerTypes?: Array<'human' | 'ai'>;
  }): void {
    this.playerManager = new PlayerManager({
      ...config,
      autoGenerate: !config.playerIds || config.playerIds.length === 0,
    });
  }

  /**
   * Create standard two-player setup
   */
  protected createTwoPlayerSetup(player1Id?: string, player2Id?: string): void {
    this.playerManager = PlayerUtils.createTwoPlayerSetup(player1Id, player2Id);
  }

  /**
   * Create chess-style setup (white/black)
   */
  protected createChessSetup(): void {
    this.playerManager = PlayerUtils.createChessSetup();
  }

  /**
   * Create card game setup
   */
  protected createCardGameSetup(playerCount: number = 4): void {
    this.playerManager = PlayerUtils.createCardGameSetup(playerCount);
  }

  /**
   * Validate player move using standard patterns
   */
  protected validatePlayerMove(moveData: Record<string, any>): MoveValidationResult {
    if (!this.playerManager) {
      return { valid: false, error: 'Player manager not initialized' };
    }

    // Use PlayerUtils for consistent validation
    const validation = PlayerUtils.validatePlayerMove(
      moveData,
      this.playerManager.getCurrentPlayerId()
    );

    if (!validation.valid) {
      return validation;
    }

    // Additional validation for valid player
    if (!this.playerManager.isValidPlayer(moveData.player)) {
      return { valid: false, error: 'Invalid player ID' };
    }

    return { valid: true };
  }

  /**
   * Advance to next player using player manager
   */
  protected advancePlayerTurn(): void {
    if (this.playerManager) {
      const nextPlayer = this.playerManager.nextPlayer();
      this.setCurrentPlayer(nextPlayer.id);
    }
  }

  /**
   * Get current player ID
   */
  protected getCurrentPlayerId(): string {
    return this.playerManager?.getCurrentPlayerId() || this.currentState.currentPlayer || '';
  }

  /**
   * Get all player IDs
   */
  protected getPlayerIds(): string[] {
    return this.playerManager?.getPlayerIds() || [];
  }

  /**
   * Check if it's a specific player's turn
   */
  protected isPlayerTurn(playerId: string): boolean {
    return (
      this.playerManager?.isPlayerTurn(playerId) || playerId === this.currentState.currentPlayer
    );
  }

  /**
   * Get player count
   */
  protected getPlayerCount(): number {
    return this.playerManager?.getPlayerCount() || 0;
  }

  /**
   * Reset player turn order
   */
  protected resetPlayerTurn(): void {
    if (this.playerManager) {
      this.playerManager.reset();
      this.setCurrentPlayer(this.playerManager.getCurrentPlayerId());
    }
  }

  /**
   * Serialize player manager state
   */
  protected serializePlayerState(): any {
    return this.playerManager?.toJSON() || null;
  }

  /**
   * Restore player manager from serialized state
   */
  protected restorePlayerState(playerState: any): void {
    if (playerState) {
      this.playerManager = PlayerManager.fromJSON(playerState);
      this.setCurrentPlayer(this.playerManager.getCurrentPlayerId());
    }
  }
}
