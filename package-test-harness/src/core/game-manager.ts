import { AbstractGame, type GameState, type GameMove, type GameConfig, type GameMetadata } from '../types/game.js';
import { StatsService } from './stats-service.js';
import { DatabaseProvider, createDatabaseProvider, type DatabaseConfig } from './database.js';
import { memoryManager } from '../utils/memory-manager.js';
import { logger } from '../utils/logger.js';
import { v4 as uuidv4 } from 'uuid';

export interface GameConstructor {
  new (_gameId: string, _database: DatabaseProvider): AbstractGame;
}

// CRITICAL: Core game state management system
// WARNING: Changes to this class affect all game instances
export class GameManager {
  // CRITICAL: Game type registry - controls which games are available
  private gameTypes: Map<string, GameConstructor> = new Map();
  // PERF: Use WeakMap to prevent memory leaks
  // CRITICAL: Active game instances in memory - core state storage
  private activeGames: Map<string, AbstractGame> = new Map();
  // PERF: Weak references for memory management
  private gameReferences: Map<string, WeakRef<AbstractGame>> = new Map();
  private gameCleanupRegistry: FinalizationRegistry<string>;
  // CRITICAL: Database connection for persistent storage
  private database: DatabaseProvider;
  private statsService: StatsService;
  private cleanupInterval?: NodeJS.Timeout;
  private memoryLogInterval?: NodeJS.Timeout;

  constructor(databaseConfig: DatabaseConfig) {
    this.database = createDatabaseProvider(databaseConfig);
    this.statsService = new StatsService(databaseConfig);

    // PERF: Set up automatic cleanup with FinalizationRegistry
    this.gameCleanupRegistry = new FinalizationRegistry((gameId: string) => {
      logger.debug('Game garbage collected', { gameId });
      this.gameReferences.delete(gameId);
    });

    // Set up memory management
    memoryManager.setCleanupCallback(async (gameId: string) => {
      await this.cleanupGame(gameId);
    });

    // PERF: Periodic cleanup of stale games
    this.cleanupInterval = setInterval(() => {
      this.performPeriodicCleanup();
    }, 60000); // Every minute
    this.cleanupInterval.unref?.();
  }

  // CRITICAL: System initialization - must complete successfully for server to function
  // WARNING: Failure here prevents all game operations
  async initialize(): Promise<void> {
    // CRITICAL: Database must be ready before any game operations
    await this.database.initialize();
    await this.statsService.initialize();
    // PERF: Start memory management system
    memoryManager.start();
    logger.info('Game manager initialized with database storage and memory management');

    // PERF: Log memory stats periodically in development
    if (process.env.NODE_ENV !== 'production') {
      this.memoryLogInterval = setInterval(() => {
        const memUsage = process.memoryUsage();
        logger.debug('Memory usage', {
          activeGames: this.activeGames.size,
          weakRefs: this.gameReferences.size,
          heapUsed: Math.round(memUsage.heapUsed / 1024 / 1024) + 'MB',
          heapTotal: Math.round(memUsage.heapTotal / 1024 / 1024) + 'MB',
        });
      }, 30000); // Every 30 seconds
      this.memoryLogInterval.unref?.();
    }
  }

  async close(): Promise<void> {
    // PERF: Clean up all resources properly
    if (this.cleanupInterval) {
      clearInterval(this.cleanupInterval);
    }

    if (this.memoryLogInterval) {
      clearInterval(this.memoryLogInterval);
    }

    // Clean up all active games
    for (const gameId of this.activeGames.keys()) {
      await this.cleanupGame(gameId);
    }

    memoryManager.stop();
    await this.statsService.close();
    await this.database.close();
  }

  // CRITICAL: Game type registration - defines available games
  // API: Called during server startup to register game implementations
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
    const tempGame = new GameClass(`temp-${Date.now()}`, this.database);
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

  // API: Game creation endpoint - creates new game instances
  // CRITICAL: Core game instantiation logic
  async createGame(gameType: string, config?: GameConfig): Promise<string> {
    // CRITICAL: Validate game type exists
    const GameClass = this.gameTypes.get(gameType);
    if (!GameClass) {
      throw new Error(`Unknown game type: ${gameType}`);
    }

    // CRITICAL: Generate unique game identifier
    const gameId = `${gameType}-${uuidv4()}`;
    // CRITICAL: Instantiate new game with database connection
    const game = new GameClass(gameId, this.database);

    // CRITICAL: Initialize game state
    await game.initializeGame(config);

    // PERF: Store both strong and weak references
    // CRITICAL: Register game in active games map - required for game access
    this.activeGames.set(gameId, game);
    const weakRef = new WeakRef(game);
    this.gameReferences.set(gameId, weakRef);
    this.gameCleanupRegistry.register(game, gameId);

    // Extract players from initial game state for stats tracking
    const initialState = await game.getGameState();
    const players = this.extractPlayersFromGameState(initialState);
    await this.statsService.trackGameCreated(gameId, gameType, players);

    return gameId;
  }

  // CRITICAL: Game retrieval - core operation for all game interactions
  // PERF: Multi-tier lookup strategy for optimal performance
  async getGame(gameType: string, gameId: string): Promise<AbstractGame> {
    // PERF: Track game access for memory management
    memoryManager.trackGameAccess(gameId);

    // PERF: First check strong references - fastest lookup
    // CRITICAL: Active games map contains live game instances
    if (this.activeGames.has(gameId)) {
      return this.activeGames.get(gameId)!;
    }

    // PERF: Check weak references
    const weakRef = this.gameReferences.get(gameId);
    if (weakRef) {
      const game = weakRef.deref();
      if (game) {
        // Promote back to strong reference since it's being accessed
        this.activeGames.set(gameId, game);
        return game;
      }
    }

    // CRITICAL: Database game restoration when not in memory
    const GameClass = this.gameTypes.get(gameType);
    if (!GameClass) {
      throw new Error(`Unknown game type: ${gameType}`);
    }

    // CRITICAL: Create new game instance for restoration
    const game = new GameClass(gameId, this.database);

    try {
      // CRITICAL: Load game state from persistent storage
      const savedState = await this.database.getGameState(gameId);
      if (!savedState) {
        throw new Error(`Game not found: ${gameId}`);
      }

      // CRITICAL: Restore the game state from database
      await game.restoreFromDatabase(savedState);

      // PERF: Store references
      this.activeGames.set(gameId, game);
      const newWeakRef = new WeakRef(game);
      this.gameReferences.set(gameId, newWeakRef);
      this.gameCleanupRegistry.register(game, gameId);

      return game;
    } catch (error) {
      logger.error('Failed to load game', { gameId, error });
      throw new Error(`Game not found: ${gameId}`);
    }
  }

  // API: Move execution endpoint - core gameplay functionality
  // CRITICAL: State mutation operation - must maintain data integrity
  async makeMove(
    gameType: string,
    gameId: string,
    moveData: Record<string, any>
  ): Promise<GameState> {
    // CRITICAL: Get game instance (may trigger database load)
    const game = await this.getGame(gameType, gameId);
    // CRITICAL: Execute move and update game state
    const gameState = await game.makeMove(moveData);

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

  // API: State retrieval endpoint - gets current game state
  // CRITICAL: Primary state access method
  async getGameState(gameType: string, gameId: string): Promise<GameState> {
    // CRITICAL: Retrieve game instance
    const game = await this.getGame(gameType, gameId);
    // CRITICAL: Return current game state
    return await game.getGameState();
  }

  async getGameHistory(gameType: string, gameId: string): Promise<GameMove[]> {
    const game = await this.getGame(gameType, gameId);
    return game.getHistory();
  }

  // API: Game restoration from move history
  // CRITICAL: State reconstruction from historical data
  async restoreGame(gameType: string, gameId: string, history: GameMove[]): Promise<void> {
    // CRITICAL: Get game instance
    const game = await this.getGame(gameType, gameId);
    // CRITICAL: Restore state by replaying moves
    await game.restoreFromHistory(history);
  }

  // API: Game deletion endpoint
  // CRITICAL: Removes game from memory and database
  async deleteGame(gameId: string): Promise<void> {
    // CRITICAL: Remove from active games
    this.activeGames.delete(gameId);
    // PERF: Remove from memory manager tracking
    memoryManager.removeGame(gameId);

    // CRITICAL: Delete from database storage
    try {
      await this.database.deleteGameState(gameId);
    } catch (error) {
      logger.error('Error deleting game from database', { gameId, error });
    }
  }

  // CRITICAL: Game cleanup and persistence before memory removal
  // PERF: Comprehensive cleanup to prevent memory leaks
  private async cleanupGame(gameId: string): Promise<void> {
    try {
      const game = this.activeGames.get(gameId);
      if (game) {
        // CRITICAL: Save state before cleanup to prevent data loss
        const state = await game.getGameState();
        if (state.status === 'active' || state.status === 'waiting') {
          // CRITICAL: Persist game state to database
          const status: 'active' | 'waiting' | 'completed' =
            state.gameOver ? 'completed' : state.status === 'waiting' ? 'waiting' : 'active';
          const gameStateData = {
            gameId,
            gameType: game.getGameType(),
            gameState: state,
            moveHistory: game.getHistory(),
            players: this.extractPlayersFromGameState(state),
            status,
          };
          await this.database.saveGameState(gameStateData);
        }
      }

      // CRITICAL: Remove from memory maps
      this.activeGames.delete(gameId);
      this.gameReferences.delete(gameId);

      logger.debug('Game cleaned up from memory', { gameId });
    } catch (error) {
      // CRITICAL: Log cleanup errors as they could indicate data loss
      logger.error('Error during game cleanup', { gameId, error });
    }
  }

  private performPeriodicCleanup(): void {
    // PERF: Clean up inactive games
    const inactivityThreshold = 30 * 60 * 1000; // 30 minutes

    for (const [gameId] of this.activeGames.entries()) {
      // Check if game can be demoted to weak reference
      if (!memoryManager.isRecentlyAccessed(gameId, inactivityThreshold)) {
        // Only keep weak reference
        this.activeGames.delete(gameId);
        logger.debug('Demoted game to weak reference', { gameId });
      }
    }

    // PERF: Force GC if memory usage is high (development only)
    if (process.env.NODE_ENV !== 'production' && global.gc) {
      const memUsage = process.memoryUsage();
      const heapUsedPercent = (memUsage.heapUsed / memUsage.heapTotal) * 100;
      if (heapUsedPercent > 80) {
        global.gc();
        logger.debug('Forced garbage collection due to high memory usage', {
          heapUsedPercent: Math.round(heapUsedPercent),
        });
      }
    }
  }

  // DEPRECATED: File-based storage replaced with database
  // TODO: Remove this method when all references are updated
  getGameDataPath(): string {
    return './game_data'; // Legacy path for backward compatibility
  }

  getStatsService(): StatsService {
    return this.statsService;
  }

  getDatabase(): DatabaseProvider {
    return this.database;
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

  // API: Game rules retrieval
  // TODO: Consider moving rules to database or proper file handling
  async getGameRules(gameType: string): Promise<string | null> {
    try {
      // HACK: Direct file system access - should be replaced by FileService (M5)
      const { readFile, access } = await import('fs/promises');
      const path = await import('path');

      // Try common locations: server-local then repo root
      const candidatePaths = [
        path.join(process.cwd(), 'package-test-harness', 'docs', 'rules', `${gameType}.md`),
        path.join(process.cwd(), 'docs', 'rules', `${gameType}.md`),
      ];

      for (const p of candidatePaths) {
        try {
          await access(p);
          const content = await readFile(p, 'utf-8');
          return content;
        } catch {
          // try next
        }
      }

      return null;
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



