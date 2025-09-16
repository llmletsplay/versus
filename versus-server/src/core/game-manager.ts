import { AbstractGame } from '../types/game.js';
import type { GameState, GameMove, GameConfig, GameMetadata } from '../types/game.js';
import { StatsService } from './stats-service.js';
import type { DatabaseConfig } from './database.js';
import { memoryManager } from '../utils/memory-manager.js';
import { logger } from '../utils/logger.js';
import { v4 as uuidv4 } from 'uuid';
import path from 'path';
import fs from 'fs/promises';

export interface GameConstructor {
  new (_gameId: string): AbstractGame;
}

export class GameManager {
  private gameTypes: Map<string, GameConstructor> = new Map();
  private activeGames: Map<string, AbstractGame> = new Map();
  private gameDataPath: string;
  private statsService: StatsService;

  constructor(gameDataPath: string = './game_data', databaseConfig?: DatabaseConfig) {
    this.gameDataPath = gameDataPath;
    this.statsService = new StatsService(gameDataPath, databaseConfig);
    this.ensureGameDataDirectory();

    // Set up memory management
    memoryManager.setCleanupCallback(async (gameId: string) => {
      await this.cleanupGame(gameId);
    });
  }

  async initialize(): Promise<void> {
    await this.statsService.initialize();
    memoryManager.start();
    logger.info('Game manager initialized with memory management');
  }

  async close(): Promise<void> {
    memoryManager.stop();
    await this.statsService.close();
  }

  private async ensureGameDataDirectory(): Promise<void> {
    try {
      await fs.access(this.gameDataPath);
    } catch {
      await fs.mkdir(this.gameDataPath, { recursive: true });
    }
  }

  registerGame(gameType: string, gameClass: GameConstructor): void {
    this.gameTypes.set(gameType, gameClass);
  }

  getAvailableGameTypes(): string[] {
    return Array.from(this.gameTypes.keys());
  }

  async getGameMetadata(gameType: string): Promise<GameMetadata | null> {
    const GameClass = this.gameTypes.get(gameType);
    if (!GameClass) {
      return null;
    }

    // Create a temporary instance to get metadata
    const tempGame = new GameClass(`temp-${Date.now()}`);
    return tempGame.getMetadata();
  }

  async getAllGameMetadata(): Promise<Record<string, GameMetadata>> {
    const metadata: Record<string, GameMetadata> = {};

    for (const gameType of this.gameTypes.keys()) {
      const meta = await this.getGameMetadata(gameType);
      if (meta) {
        metadata[gameType] = meta;
      }
    }

    return metadata;
  }

  async createGame(gameType: string, config?: GameConfig): Promise<string> {
    const GameClass = this.gameTypes.get(gameType);
    if (!GameClass) {
      throw new Error(`Unknown game type: ${gameType}`);
    }

    const gameId = `${gameType}-${uuidv4()}`;
    const game = new GameClass(gameId);

    await game.initializeGame(config);
    this.activeGames.set(gameId, game);

    // Extract players from initial game state for stats tracking
    const initialState = await game.getGameState();
    const players = this.extractPlayersFromGameState(initialState);
    await this.statsService.trackGameCreated(gameId, gameType, players);

    return gameId;
  }

  async getGame(gameType: string, gameId: string): Promise<AbstractGame> {
    // Track game access for memory management
    memoryManager.trackGameAccess(gameId);

    // First check if game is already loaded
    if (this.activeGames.has(gameId)) {
      return this.activeGames.get(gameId)!;
    }

    // Try to load from disk
    const GameClass = this.gameTypes.get(gameType);
    if (!GameClass) {
      throw new Error(`Unknown game type: ${gameType}`);
    }

    const game = new GameClass(gameId);

    try {
      await (game as any).loadState();
      this.activeGames.set(gameId, game);
      return game;
    } catch {
      throw new Error(`Game not found: ${gameId}`);
    }
  }

  async makeMove(
    gameType: string,
    gameId: string,
    moveData: Record<string, any>
  ): Promise<GameState> {
    const game = await this.getGame(gameType, gameId);
    const gameState = await (game as any).makeMove(moveData);

    // Track the move for stats
    const move: GameMove = {
      player: moveData.player || 'unknown',
      moveData,
      timestamp: Date.now(),
    };
    await this.statsService.trackMove(gameId, gameType, move);

    // Check if game is completed and track completion
    if (gameState.gameOver) {
      await this.statsService.trackGameCompleted(gameId, gameType, gameState.winner || undefined);
    }

    return gameState;
  }

  async getGameState(gameType: string, gameId: string): Promise<GameState> {
    const game = await this.getGame(gameType, gameId);
    return await game.getGameState();
  }

  async getGameHistory(gameType: string, gameId: string): Promise<GameMove[]> {
    const game = await this.getGame(gameType, gameId);
    return game.getHistory();
  }

  async restoreGame(gameType: string, gameId: string, history: GameMove[]): Promise<void> {
    const game = await this.getGame(gameType, gameId);
    await game.restoreFromHistory(history);
  }

  async deleteGame(gameId: string): Promise<void> {
    this.activeGames.delete(gameId);
    memoryManager.removeGame(gameId);

    const filePath = path.join(this.gameDataPath, `${gameId}.json`);
    try {
      await fs.unlink(filePath);
    } catch {
      // File might not exist, which is fine
    }
  }

  private async cleanupGame(gameId: string): Promise<void> {
    this.activeGames.delete(gameId);
    logger.debug('Game cleaned up from memory', { gameId });
  }

  getGameDataPath(): string {
    return this.gameDataPath;
  }

  getStatsService(): StatsService {
    return this.statsService;
  }

  private extractPlayersFromGameState(gameState: GameState): string[] {
    // Extract player information from different game state structures
    const players: string[] = [];

    if (gameState.currentPlayer) {
      players.push(gameState.currentPlayer);
    }

    if (gameState.players && typeof gameState.players === 'object') {
      // Handle different player object structures
      if (Array.isArray(gameState.players)) {
        players.push(...gameState.players);
      } else {
        players.push(...Object.keys(gameState.players));
      }
    }

    // For games with standard player names, add common defaults
    if (players.length === 0) {
      const gameType = gameState.gameType;
      if (['tic-tac-toe'].includes(gameType)) {
        players.push('X', 'O');
      } else if (['connect-four'].includes(gameType)) {
        players.push('R', 'Y');
      } else if (['chess', 'checkers', 'omok', 'othello'].includes(gameType)) {
        players.push('white', 'black');
      } else if (['battleship', 'mancala'].includes(gameType)) {
        players.push('player1', 'player2');
      } else {
        // Default for unknown games
        players.push('player1', 'player2');
      }
    }

    return [...new Set(players)]; // Remove duplicates
  }

  async getGameRules(gameType: string): Promise<string | null> {
    try {
      const rulesPath = path.join(process.cwd(), 'docs', 'rules', `${gameType}.md`);
      const rulesContent = await fs.readFile(rulesPath, 'utf-8');
      return rulesContent;
    } catch (error) {
      logger.warn(`Rules not found for game type: ${gameType}`, { error });
      return null;
    }
  }

  // Cleanup inactive games (optional optimization)
  cleanupInactiveGames(maxAge: number = 24 * 60 * 60 * 1000): void {
    const now = Date.now();
    const gamesToRemove: string[] = [];

    for (const [gameId, game] of this.activeGames.entries()) {
      const history = game.getHistory();
      const lastMove = history[history.length - 1];

      if (lastMove && now - lastMove.timestamp > maxAge) {
        gamesToRemove.push(gameId);
      }
    }

    for (const gameId of gamesToRemove) {
      this.activeGames.delete(gameId);
    }
  }
}
