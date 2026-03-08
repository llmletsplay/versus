import type { GameMove } from '../types/game.js';

export interface ExecuteResult {
  rowsAffected: number;
  lastInsertId?: number | string | bigint;
}

export interface ActivityLog {
  id?: number;
  gameId: string;
  gameType: string;
  action: 'created' | 'completed' | 'move_made';
  timestamp: number;
  players?: string;
}

export interface GameStateData {
  gameId: string;
  gameType: string;
  gameState: any;
  moveHistory: GameMove[];
  players: string[];
  status: 'active' | 'waiting' | 'completed' | 'abandoned';
}

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

export interface DatabaseProvider {
  initialize(): Promise<void>;
  close(): Promise<void>;
  query?<T = any>(_sql: string, _params?: any[]): Promise<T[]>;
  get?<T = any>(_sql: string, _params?: any[]): Promise<T | null>;
  execute?(_sql: string, _params?: any[]): Promise<ExecuteResult>;
  saveGameState(gameStateData: GameStateData): Promise<void>;
  getGameState(gameId: string): Promise<GameStateData | null>;
  deleteGameState(gameId: string): Promise<void>;
  getActiveGames?(): Promise<GameStateData[]>;
  getGamesByPlayer?(playerId: string): Promise<GameStateData[]>;
  saveGameStats?(gameStats: GameStats): Promise<void>;
  getGameStats?(gameId: string): Promise<GameStats | null>;
  getAllGameStats?(): Promise<GameStats[]>;
  getGameStatsByType?(gameType: string): Promise<GameStats[]>;
  logActivity?(activity: Omit<ActivityLog, 'id'>): Promise<void>;
  getActivityLog?(limit?: number): Promise<ActivityLog[]>;
  deleteOldActivity?(olderThanDays: number): Promise<void>;
  deleteGameStats?(gameId: string): Promise<void>;
}

export class InMemoryDatabaseProvider implements DatabaseProvider {
  private gameStates = new Map<string, GameStateData>();
  private gameStats = new Map<string, GameStats>();
  private activityLog: ActivityLog[] = [];
  private nextActivityId = 1;

  async initialize(): Promise<void> {}

  async close(): Promise<void> {
    this.gameStates.clear();
    this.gameStats.clear();
    this.activityLog = [];
    this.nextActivityId = 1;
  }

  async query<T = any>(_sql: string, _params: any[] = []): Promise<T[]> {
    return [];
  }

  async get<T = any>(_sql: string, _params: any[] = []): Promise<T | null> {
    return null;
  }

  async execute(_sql: string, _params: any[] = []): Promise<ExecuteResult> {
    return { rowsAffected: 0 };
  }

  async saveGameState(gameStateData: GameStateData): Promise<void> {
    this.gameStates.set(gameStateData.gameId, {
      ...gameStateData,
      gameState: structuredClone(gameStateData.gameState),
      moveHistory: structuredClone(gameStateData.moveHistory),
      players: [...gameStateData.players],
    });
  }

  async getGameState(gameId: string): Promise<GameStateData | null> {
    const gameState = this.gameStates.get(gameId);
    return gameState
      ? {
          ...gameState,
          gameState: structuredClone(gameState.gameState),
          moveHistory: structuredClone(gameState.moveHistory),
          players: [...gameState.players],
        }
      : null;
  }

  async deleteGameState(gameId: string): Promise<void> {
    this.gameStates.delete(gameId);
  }

  async getActiveGames(): Promise<GameStateData[]> {
    return Array.from(this.gameStates.values())
      .filter((game) => game.status === 'active' || game.status === 'waiting')
      .map((game) => ({
        ...game,
        gameState: structuredClone(game.gameState),
        moveHistory: structuredClone(game.moveHistory),
        players: [...game.players],
      }));
  }

  async getGamesByPlayer(playerId: string): Promise<GameStateData[]> {
    return Array.from(this.gameStates.values())
      .filter((game) => game.players.includes(playerId))
      .map((game) => ({
        ...game,
        gameState: structuredClone(game.gameState),
        moveHistory: structuredClone(game.moveHistory),
        players: [...game.players],
      }));
  }

  async saveGameStats(gameStats: GameStats): Promise<void> {
    this.gameStats.set(gameStats.gameId, structuredClone(gameStats));
  }

  async getGameStats(gameId: string): Promise<GameStats | null> {
    const stats = this.gameStats.get(gameId);
    return stats ? structuredClone(stats) : null;
  }

  async getAllGameStats(): Promise<GameStats[]> {
    return Array.from(this.gameStats.values()).map((stats) => structuredClone(stats));
  }

  async getGameStatsByType(gameType: string): Promise<GameStats[]> {
    return Array.from(this.gameStats.values())
      .filter((stats) => stats.gameType === gameType)
      .map((stats) => structuredClone(stats));
  }

  async logActivity(activity: Omit<ActivityLog, 'id'>): Promise<void> {
    this.activityLog.push({
      ...activity,
      id: this.nextActivityId++,
    });
  }

  async getActivityLog(limit: number = 100): Promise<ActivityLog[]> {
    return this.activityLog
      .slice(-limit)
      .reverse()
      .map((activity) => ({ ...activity }));
  }

  async deleteOldActivity(olderThanDays: number): Promise<void> {
    const cutoff = Date.now() - olderThanDays * 24 * 60 * 60 * 1000;
    this.activityLog = this.activityLog.filter((activity) => activity.timestamp >= cutoff);
  }

  async deleteGameStats(gameId: string): Promise<void> {
    this.gameStats.delete(gameId);
  }
}
