import type { GameMove } from '../types/game.js';
import { DatabaseProvider, createDatabaseProvider, type DatabaseConfig } from './database.js';
import { logger } from '../utils/logger.js';

export interface GameStats {
  gameId: string;
  gameType: string;
  startTime: number;
  endTime?: number;
  duration?: number;
  players: string[];
  winner?: string;
  totalMoves: number;
  status: 'active' | 'completed' | 'abandoned';
}

export interface GlobalStats {
  totalGamesPlayed: number;
  totalGamesActive: number;
  gamesByType: Record<string, number>;
  activeGamesByType: Record<string, number>;
  averageGameDuration: number;
  totalMoves: number;
  popularGameTypes: Array<{ gameType: string; count: number; percentage: number }>;
  playerStats: {
    totalUniquePlayers: number;
    averagePlayersPerGame: number;
  };
  timeStats: {
    gamesPlayedToday: number;
    gamesPlayedThisWeek: number;
    gamesPlayedThisMonth: number;
  };
  recentActivity: Array<{
    gameId: string;
    gameType: string;
    action: 'created' | 'completed' | 'move_made';
    timestamp: number;
    players?: string[];
  }>;
}

export class StatsService {
  private db: DatabaseProvider;

  constructor(databaseConfig: DatabaseConfig) {
    this.db = createDatabaseProvider(databaseConfig);
  }

  async initialize(): Promise<void> {
    await this.db.initialize();
  }

  async close(): Promise<void> {
    await this.db.close();
  }

  async trackGameCreated(gameId: string, gameType: string, players: string[]): Promise<void> {
    const gameStats: GameStats = {
      gameId,
      gameType,
      startTime: Date.now(),
      players,
      totalMoves: 0,
      status: 'active',
    };

    await this.db.saveGameStats(gameStats);
    await this.db.logActivity({
      gameId,
      gameType,
      action: 'created',
      timestamp: Date.now(),
      players: JSON.stringify(players),
    });
  }

  async trackMove(gameId: string, gameType: string, _move: GameMove): Promise<void> {
    const gameStats = await this.db.getGameStats(gameId);
    if (gameStats) {
      gameStats.totalMoves++;
      await this.db.saveGameStats(gameStats);

      await this.db.logActivity({
        gameId,
        gameType,
        action: 'move_made',
        timestamp: Date.now(),
      });
    }
  }

  async trackGameCompleted(gameId: string, gameType: string, winner?: string): Promise<void> {
    const gameStats = await this.db.getGameStats(gameId);
    if (gameStats) {
      gameStats.endTime = Date.now();
      gameStats.duration = gameStats.endTime - gameStats.startTime;
      gameStats.winner = winner;
      gameStats.status = 'completed';

      await this.db.saveGameStats(gameStats);
      await this.db.logActivity({
        gameId,
        gameType,
        action: 'completed',
        timestamp: Date.now(),
      });
    }
  }

  async getGlobalStats(): Promise<GlobalStats> {
    try {
      const allGameStats = await this.db.getAllGameStats();
      const activityLog = await this.db.getActivityLog(1000); // Get last 1000 activities

      const now = Date.now();
      const oneDayAgo = now - 24 * 60 * 60 * 1000;
      const oneWeekAgo = now - 7 * 24 * 60 * 60 * 1000;
      const oneMonthAgo = now - 30 * 24 * 60 * 60 * 1000;

      const completedGames = allGameStats.filter((g) => g.status === 'completed');
      const activeGames = allGameStats.filter((g) => g.status === 'active');

      // Game type statistics
      const gamesByType: Record<string, number> = {};
      const activeGamesByType: Record<string, number> = {};

      allGameStats.forEach((game) => {
        gamesByType[game.gameType] = (gamesByType[game.gameType] || 0) + 1;
      });

      activeGames.forEach((game) => {
        activeGamesByType[game.gameType] = (activeGamesByType[game.gameType] || 0) + 1;
      });

      // Popular game types
      const popularGameTypes = Object.entries(gamesByType)
        .map(([gameType, count]) => ({
          gameType,
          count,
          percentage: allGameStats.length > 0 ? Math.round((count / allGameStats.length) * 100) : 0,
        }))
        .sort((a, b) => b.count - a.count);

      // Duration statistics
      const completedGameDurations = completedGames
        .filter((g) => g.duration)
        .map((g) => g.duration!);

      const averageGameDuration =
        completedGameDurations.length > 0
          ? Math.round(
              completedGameDurations.reduce((sum, duration) => sum + duration, 0) /
                completedGameDurations.length
            )
          : 0;

      // Player statistics
      const allPlayers = new Set<string>();
      let totalPlayerSlots = 0;

      allGameStats.forEach((game) => {
        game.players.forEach((player) => allPlayers.add(player));
        totalPlayerSlots += game.players.length;
      });

      // Time-based statistics
      const gamesPlayedToday = activityLog.filter(
        (activity) => activity.action === 'created' && activity.timestamp > oneDayAgo
      ).length;

      const gamesPlayedThisWeek = activityLog.filter(
        (activity) => activity.action === 'created' && activity.timestamp > oneWeekAgo
      ).length;

      const gamesPlayedThisMonth = activityLog.filter(
        (activity) => activity.action === 'created' && activity.timestamp > oneMonthAgo
      ).length;

      // Recent activity (last 20 events)
      const recentActivity = activityLog.slice(0, 20).map((activity) => ({
        gameId: activity.gameId,
        gameType: activity.gameType,
        action: activity.action,
        timestamp: activity.timestamp,
        players: activity.players ? JSON.parse(activity.players) : undefined,
      }));

      return {
        totalGamesPlayed: allGameStats.length,
        totalGamesActive: activeGames.length,
        gamesByType,
        activeGamesByType,
        averageGameDuration,
        totalMoves: allGameStats.reduce((sum, game) => sum + game.totalMoves, 0),
        popularGameTypes,
        playerStats: {
          totalUniquePlayers: allPlayers.size,
          averagePlayersPerGame:
            totalPlayerSlots > 0
              ? Math.round((totalPlayerSlots / allGameStats.length) * 10) / 10
              : 0,
        },
        timeStats: {
          gamesPlayedToday,
          gamesPlayedThisWeek,
          gamesPlayedThisMonth,
        },
        recentActivity,
      };
    } catch (error) {
      logger.warn('Database not available, returning empty stats', {
        error: (error as Error).message,
      });
      // Return default empty stats when database is not available
      return {
        totalGamesPlayed: 0,
        totalGamesActive: 0,
        gamesByType: {},
        activeGamesByType: {},
        averageGameDuration: 0,
        totalMoves: 0,
        popularGameTypes: [],
        playerStats: {
          totalUniquePlayers: 0,
          averagePlayersPerGame: 0,
        },
        timeStats: {
          gamesPlayedToday: 0,
          gamesPlayedThisWeek: 0,
          gamesPlayedThisMonth: 0,
        },
        recentActivity: [],
      };
    }
  }

  async getGameTypeStats(gameType: string): Promise<{
    totalGames: number;
    activeGames: number;
    completedGames: number;
    averageDuration: number;
    totalMoves: number;
    winRates: Record<string, number>;
  }> {
    try {
      const gameTypeStats = await this.db.getGameStatsByType(gameType);

      const completedGames = gameTypeStats.filter((g) => g.status === 'completed');
      const activeGames = gameTypeStats.filter((g) => g.status === 'active');

      const durations = completedGames.filter((g) => g.duration).map((g) => g.duration!);

      const averageDuration =
        durations.length > 0
          ? Math.round(durations.reduce((sum, d) => sum + d, 0) / durations.length)
          : 0;

      // Calculate win rates
      const winCounts: Record<string, number> = {};
      const totalCompletedGames = completedGames.length;

      completedGames.forEach((game) => {
        if (game.winner && game.winner !== 'draw') {
          winCounts[game.winner] = (winCounts[game.winner] || 0) + 1;
        }
      });

      const winRates: Record<string, number> = {};
      Object.entries(winCounts).forEach(([player, wins]) => {
        winRates[player] =
          totalCompletedGames > 0 ? Math.round((wins / totalCompletedGames) * 100) : 0;
      });

      return {
        totalGames: gameTypeStats.length,
        activeGames: activeGames.length,
        completedGames: completedGames.length,
        averageDuration,
        totalMoves: gameTypeStats.reduce((sum, game) => sum + game.totalMoves, 0),
        winRates,
      };
    } catch (error) {
      logger.warn(`Database not available for game type ${gameType}, returning empty stats`, {
        gameType,
        error: (error as Error).message,
      });
      // Return default empty stats when database is not available
      return {
        totalGames: 0,
        activeGames: 0,
        completedGames: 0,
        averageDuration: 0,
        totalMoves: 0,
        winRates: {},
      };
    }
  }

  // Utility methods for maintenance
  async cleanupOldData(olderThanDays: number = 90): Promise<void> {
    await this.db.deleteOldActivity(olderThanDays);
  }

  async deleteGame(gameId: string): Promise<void> {
    await this.db.deleteGameStats(gameId);
  }
}
