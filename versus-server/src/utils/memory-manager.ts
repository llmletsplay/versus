import { logger } from './logger.js';

export interface MemoryManagerConfig {
  maxActiveGames: number;
  gameInactivityTimeout: number; // milliseconds
  cleanupInterval: number; // milliseconds
  memoryCheckInterval: number; // milliseconds
  maxMemoryUsage: number; // bytes
}

export interface GameMemoryInfo {
  gameId: string;
  gameType: string;
  lastAccessed: number;
  memorySize: number;
  playerCount: number;
}

export class MemoryManager {
  private static instance: MemoryManager;
  private config: MemoryManagerConfig;
  private gameAccessTimes: Map<string, number> = new Map();
  private cleanupTimer?: NodeJS.Timeout;
  private memoryCheckTimer?: NodeJS.Timeout;
  private onGameCleanup?: (_gameId: string) => Promise<void>;

  private constructor(config: Partial<MemoryManagerConfig> = {}) {
    this.config = {
      maxActiveGames: config.maxActiveGames || 1000,
      gameInactivityTimeout: config.gameInactivityTimeout || 30 * 60 * 1000, // 30 minutes
      cleanupInterval: config.cleanupInterval || 5 * 60 * 1000, // 5 minutes
      memoryCheckInterval: config.memoryCheckInterval || 60 * 1000, // 1 minute
      maxMemoryUsage: config.maxMemoryUsage || 512 * 1024 * 1024, // 512MB
    };
  }

  public static getInstance(config?: Partial<MemoryManagerConfig>): MemoryManager {
    if (!MemoryManager.instance) {
      MemoryManager.instance = new MemoryManager(config);
    }
    return MemoryManager.instance;
  }

  public setCleanupCallback(callback: (_gameId: string) => Promise<void>): void {
    this.onGameCleanup = callback;
  }

  public start(): void {
    this.startCleanupTimer();
    this.startMemoryMonitor();
    logger.info('Memory manager started', {
      maxActiveGames: this.config.maxActiveGames,
      gameInactivityTimeout: this.config.gameInactivityTimeout,
      cleanupInterval: this.config.cleanupInterval,
    });
  }

  public stop(): void {
    if (this.cleanupTimer) {
      clearInterval(this.cleanupTimer);
      this.cleanupTimer = undefined;
    }
    if (this.memoryCheckTimer) {
      clearInterval(this.memoryCheckTimer);
      this.memoryCheckTimer = undefined;
    }
    logger.info('Memory manager stopped');
  }

  public trackGameAccess(gameId: string): void {
    this.gameAccessTimes.set(gameId, Date.now());
  }

  public removeGame(gameId: string): void {
    this.gameAccessTimes.delete(gameId);
  }

  public getInactiveGames(threshold?: number): string[] {
    const inactivityThreshold = threshold || this.config.gameInactivityTimeout;
    const now = Date.now();
    const inactiveGames: string[] = [];

    for (const [gameId, lastAccessed] of this.gameAccessTimes.entries()) {
      if (now - lastAccessed > inactivityThreshold) {
        inactiveGames.push(gameId);
      }
    }

    return inactiveGames;
  }

  public getMemoryStats(): {
    totalActiveGames: number;
    memoryUsage: NodeJS.MemoryUsage;
    oldestGameAge: number;
    averageGameAge: number;
  } {
    const memoryUsage = process.memoryUsage();
    const now = Date.now();
    const gameTimes = Array.from(this.gameAccessTimes.values());

    let oldestGameAge = 0;
    let averageGameAge = 0;

    if (gameTimes.length > 0) {
      const ages = gameTimes.map(time => now - time);
      oldestGameAge = Math.max(...ages);
      averageGameAge = ages.reduce((sum, age) => sum + age, 0) / ages.length;
    }

    return {
      totalActiveGames: this.gameAccessTimes.size,
      memoryUsage,
      oldestGameAge,
      averageGameAge,
    };
  }

  private startCleanupTimer(): void {
    this.cleanupTimer = setInterval(async () => {
      await this.performCleanup();
    }, this.config.cleanupInterval);
  }

  private startMemoryMonitor(): void {
    this.memoryCheckTimer = setInterval(() => {
      this.checkMemoryUsage();
    }, this.config.memoryCheckInterval);
  }

  private async performCleanup(): Promise<void> {
    try {
      const stats = this.getMemoryStats();
      logger.debug('Performing memory cleanup', {
        totalActiveGames: stats.totalActiveGames,
        memoryUsageRSS: Math.round(stats.memoryUsage.rss / 1024 / 1024),
        memoryUsageHeapUsed: Math.round(stats.memoryUsage.heapUsed / 1024 / 1024),
        oldestGameAge: Math.round(stats.oldestGameAge / 1000 / 60),
      });

      // Clean up inactive games
      const inactiveGames = this.getInactiveGames();
      if (inactiveGames.length > 0) {
        logger.info(`Cleaning up ${inactiveGames.length} inactive games`, {
          gameIds: inactiveGames.slice(0, 5), // Log first 5 for brevity
          totalInactive: inactiveGames.length,
        });

        for (const gameId of inactiveGames) {
          await this.cleanupGame(gameId);
        }
      }

      // Clean up excess games if we exceed the limit
      if (stats.totalActiveGames > this.config.maxActiveGames) {
        const excessCount = stats.totalActiveGames - this.config.maxActiveGames;
        const oldestGames = this.getOldestGames(excessCount);

        logger.info(`Cleaning up ${excessCount} excess games`, {
          maxActiveGames: this.config.maxActiveGames,
          currentActiveGames: stats.totalActiveGames,
        });

        for (const gameId of oldestGames) {
          await this.cleanupGame(gameId);
        }
      }
    } catch (error) {
      logger.error('Error during memory cleanup', error as Error);
    }
  }

  private checkMemoryUsage(): void {
    const memoryUsage = process.memoryUsage();
    const heapUsedMB = Math.round(memoryUsage.heapUsed / 1024 / 1024);
    const rssMB = Math.round(memoryUsage.rss / 1024 / 1024);

    if (memoryUsage.heapUsed > this.config.maxMemoryUsage) {
      logger.warn('High memory usage detected', {
        heapUsedMB,
        rssMB,
        maxMemoryMB: Math.round(this.config.maxMemoryUsage / 1024 / 1024),
        activeGames: this.gameAccessTimes.size,
      });

      // Force cleanup of oldest games when memory is high
      const oldestGames = this.getOldestGames(Math.min(10, this.gameAccessTimes.size / 4));
      oldestGames.forEach(gameId => {
        this.cleanupGame(gameId).catch(error => {
          logger.error('Error during emergency cleanup', error as Error, { gameId });
        });
      });
    }
  }

  private getOldestGames(count: number): string[] {
    const gameEntries = Array.from(this.gameAccessTimes.entries());
    gameEntries.sort((a, b) => a[1] - b[1]); // Sort by last accessed time (oldest first)
    return gameEntries.slice(0, count).map(([gameId]) => gameId);
  }

  private async cleanupGame(gameId: string): Promise<void> {
    try {
      if (this.onGameCleanup) {
        await this.onGameCleanup(gameId);
      }
      this.removeGame(gameId);
      logger.debug('Game cleaned up', { gameId });
    } catch (error) {
      logger.error('Error cleaning up game', error as Error, { gameId });
    }
  }

  // Force garbage collection if available (Node.js with --expose-gc flag)
  public forceGarbageCollection(): void {
    if (global.gc) {
      global.gc();
      logger.debug('Forced garbage collection');
    } else {
      logger.warn('Garbage collection not available (run with --expose-gc flag)');
    }
  }

  // Get detailed memory info for monitoring
  public getDetailedMemoryInfo(): {
    process: NodeJS.MemoryUsage;
    activeGames: number;
    config: MemoryManagerConfig;
    uptime: number;
  } {
    return {
      process: process.memoryUsage(),
      activeGames: this.gameAccessTimes.size,
      config: this.config,
      uptime: process.uptime(),
    };
  }
}

// Export singleton getter
export const memoryManager = MemoryManager.getInstance();
