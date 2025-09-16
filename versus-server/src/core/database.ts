import Database from 'better-sqlite3';
import { Pool } from 'pg';
import type { GameStats } from './stats-service.js';
import { logger } from '../utils/logger.js';

export interface DatabaseConfig {
  type: 'sqlite' | 'postgresql';
  connectionString?: string;
  sqlitePath?: string;
}

export interface ActivityLog {
  id?: number;
  gameId: string;
  gameType: string;
  action: 'created' | 'completed' | 'move_made';
  timestamp: number;
  players?: string;
}

export abstract class DatabaseProvider {
  abstract initialize(): Promise<void>;
  abstract close(): Promise<void>;

  // Generic query operations for auth and other custom queries
  abstract query(sql: string, params?: any[]): Promise<any[]>;

  // Game stats operations
  abstract saveGameStats(_gameStats: GameStats): Promise<void>;
  abstract getGameStats(_gameId: string): Promise<GameStats | null>;
  abstract getAllGameStats(): Promise<GameStats[]>;
  abstract getGameStatsByType(_gameType: string): Promise<GameStats[]>;

  // Activity log operations
  abstract logActivity(_activity: Omit<ActivityLog, 'id'>): Promise<void>;
  abstract getActivityLog(_limit?: number): Promise<ActivityLog[]>;

  // Cleanup operations
  abstract deleteOldActivity(_olderThanDays: number): Promise<void>;
  abstract deleteGameStats(_gameId: string): Promise<void>;
}

export class SQLiteProvider extends DatabaseProvider {
  private db: Database.Database | null = null;
  private dbPath: string;

  constructor(dbPath: string = './game_data/stats.db') {
    super();
    this.dbPath = dbPath;
  }

  async initialize(): Promise<void> {
    try {
      this.db = new Database(this.dbPath);

      // Create tables if they don't exist
      this.db.exec(`
        CREATE TABLE IF NOT EXISTS game_stats (
          game_id TEXT PRIMARY KEY,
          game_type TEXT NOT NULL,
          start_time INTEGER NOT NULL,
          end_time INTEGER,
          duration INTEGER,
          players TEXT NOT NULL,
          winner TEXT,
          total_moves INTEGER NOT NULL DEFAULT 0,
          status TEXT NOT NULL CHECK (status IN ('active', 'completed', 'abandoned')),
          created_at INTEGER NOT NULL DEFAULT (strftime('%s', 'now')),
          updated_at INTEGER NOT NULL DEFAULT (strftime('%s', 'now'))
        );
        
        CREATE TABLE IF NOT EXISTS activity_log (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          game_id TEXT NOT NULL,
          game_type TEXT NOT NULL,
          action TEXT NOT NULL CHECK (action IN ('created', 'completed', 'move_made')),
          timestamp INTEGER NOT NULL,
          players TEXT,
          created_at INTEGER NOT NULL DEFAULT (strftime('%s', 'now'))
        );
        
        CREATE INDEX IF NOT EXISTS idx_game_stats_type ON game_stats(game_type);
        CREATE INDEX IF NOT EXISTS idx_game_stats_status ON game_stats(status);
        CREATE INDEX IF NOT EXISTS idx_activity_timestamp ON activity_log(timestamp);
        CREATE INDEX IF NOT EXISTS idx_activity_game_type ON activity_log(game_type);
      `);

      logger.info('💾 SQLite database initialized successfully');
    } catch (error) {
      logger.warn('⚠️  SQLite initialization failed, database features will be disabled', {
        error: (error as Error).message,
      });
      this.db = null;
    }
  }

  async close(): Promise<void> {
    if (this.db) {
      this.db.close();
      this.db = null;
    }
  }

  async query(sql: string, params: any[] = []): Promise<any[]> {
    if (!this.db) {
      throw new Error('Database not initialized');
    }

    try {
      if (sql.trim().toLowerCase().startsWith('select')) {
        const stmt = this.db.prepare(sql);
        return stmt.all(...params);
      } else {
        // For INSERT, UPDATE, DELETE operations
        const stmt = this.db.prepare(sql);
        stmt.run(...params);
        return [];
      }
    } catch (error) {
      logger.error('SQLite query error', { error: error instanceof Error ? error.message : error });
      throw error;
    }
  }

  async saveGameStats(gameStats: GameStats): Promise<void> {
    if (!this.db) {
      logger.warn('Database not available, skipping stats save');
      return;
    }

    const stmt = this.db.prepare(`
      INSERT OR REPLACE INTO game_stats 
      (game_id, game_type, start_time, end_time, duration, players, winner, total_moves, status, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, strftime('%s', 'now'))
    `);

    stmt.run(
      gameStats.gameId,
      gameStats.gameType,
      gameStats.startTime,
      gameStats.endTime || null,
      gameStats.duration || null,
      JSON.stringify(gameStats.players),
      gameStats.winner || null,
      gameStats.totalMoves,
      gameStats.status
    );
  }

  async getGameStats(gameId: string): Promise<GameStats | null> {
    if (!this.db) {
      return null;
    }

    const stmt = this.db.prepare('SELECT * FROM game_stats WHERE game_id = ?');
    const row = stmt.get(gameId) as any;

    if (!row) {
      return null;
    }

    return {
      gameId: row.game_id,
      gameType: row.game_type,
      startTime: row.start_time,
      endTime: row.end_time || undefined,
      duration: row.duration || undefined,
      players: JSON.parse(row.players),
      winner: row.winner || undefined,
      totalMoves: row.total_moves,
      status: row.status,
    };
  }

  async getAllGameStats(): Promise<GameStats[]> {
    if (!this.db) {
      return [];
    }

    const stmt = this.db.prepare('SELECT * FROM game_stats ORDER BY start_time DESC');
    const rows = stmt.all() as any[];

    return rows.map(row => ({
      gameId: row.game_id,
      gameType: row.game_type,
      startTime: row.start_time,
      endTime: row.end_time || undefined,
      duration: row.duration || undefined,
      players: JSON.parse(row.players),
      winner: row.winner || undefined,
      totalMoves: row.total_moves,
      status: row.status,
    }));
  }

  async getGameStatsByType(gameType: string): Promise<GameStats[]> {
    if (!this.db) {
      throw new Error('Database not initialized');
    }

    const stmt = this.db.prepare(
      'SELECT * FROM game_stats WHERE game_type = ? ORDER BY start_time DESC'
    );
    const rows = stmt.all(gameType) as any[];

    return rows.map(row => ({
      gameId: row.game_id,
      gameType: row.game_type,
      startTime: row.start_time,
      endTime: row.end_time || undefined,
      duration: row.duration || undefined,
      players: JSON.parse(row.players),
      winner: row.winner || undefined,
      totalMoves: row.total_moves,
      status: row.status,
    }));
  }

  async logActivity(activity: Omit<ActivityLog, 'id'>): Promise<void> {
    if (!this.db) {
      throw new Error('Database not initialized');
    }

    const stmt = this.db.prepare(`
      INSERT INTO activity_log (game_id, game_type, action, timestamp, players)
      VALUES (?, ?, ?, ?, ?)
    `);

    stmt.run(
      activity.gameId,
      activity.gameType,
      activity.action,
      activity.timestamp,
      activity.players || null
    );
  }

  async getActivityLog(limit: number = 100): Promise<ActivityLog[]> {
    if (!this.db) {
      throw new Error('Database not initialized');
    }

    const stmt = this.db.prepare(`
      SELECT * FROM activity_log 
      ORDER BY timestamp DESC 
      LIMIT ?
    `);
    const rows = stmt.all(limit) as any[];

    return rows.map(row => ({
      id: row.id,
      gameId: row.game_id,
      gameType: row.game_type,
      action: row.action,
      timestamp: row.timestamp,
      players: row.players || undefined,
    }));
  }

  async deleteOldActivity(olderThanDays: number): Promise<void> {
    if (!this.db) {
      throw new Error('Database not initialized');
    }

    const cutoffTime = Date.now() - olderThanDays * 24 * 60 * 60 * 1000;
    const stmt = this.db.prepare('DELETE FROM activity_log WHERE timestamp < ?');
    stmt.run(cutoffTime);
  }

  async deleteGameStats(gameId: string): Promise<void> {
    if (!this.db) {
      throw new Error('Database not initialized');
    }

    const stmt = this.db.prepare('DELETE FROM game_stats WHERE game_id = ?');
    stmt.run(gameId);
  }
}

export class PostgreSQLProvider extends DatabaseProvider {
  private pool: Pool | null = null;
  private connectionString: string;

  constructor(connectionString: string) {
    super();
    this.connectionString = connectionString;
  }

  async initialize(): Promise<void> {
    this.pool = new Pool({
      connectionString: this.connectionString,
    });

    // Create tables if they don't exist
    const client = await this.pool.connect();
    try {
      await client.query(`
        CREATE TABLE IF NOT EXISTS game_stats (
          game_id VARCHAR(255) PRIMARY KEY,
          game_type VARCHAR(100) NOT NULL,
          start_time BIGINT NOT NULL,
          end_time BIGINT,
          duration BIGINT,
          players TEXT NOT NULL,
          winner VARCHAR(100),
          total_moves INTEGER NOT NULL DEFAULT 0,
          status VARCHAR(20) NOT NULL CHECK (status IN ('active', 'completed', 'abandoned')),
          created_at TIMESTAMP NOT NULL DEFAULT NOW(),
          updated_at TIMESTAMP NOT NULL DEFAULT NOW()
        );
        
        CREATE TABLE IF NOT EXISTS activity_log (
          id SERIAL PRIMARY KEY,
          game_id VARCHAR(255) NOT NULL,
          game_type VARCHAR(100) NOT NULL,
          action VARCHAR(20) NOT NULL CHECK (action IN ('created', 'completed', 'move_made')),
          timestamp BIGINT NOT NULL,
          players TEXT,
          created_at TIMESTAMP NOT NULL DEFAULT NOW()
        );
        
        CREATE INDEX IF NOT EXISTS idx_game_stats_type ON game_stats(game_type);
        CREATE INDEX IF NOT EXISTS idx_game_stats_status ON game_stats(status);
        CREATE INDEX IF NOT EXISTS idx_activity_timestamp ON activity_log(timestamp);
        CREATE INDEX IF NOT EXISTS idx_activity_game_type ON activity_log(game_type);
      `);
    } finally {
      client.release();
    }
  }

  async close(): Promise<void> {
    if (this.pool) {
      await this.pool.end();
      this.pool = null;
    }
  }

  async query(sql: string, params: any[] = []): Promise<any[]> {
    if (!this.pool) {
      throw new Error('Database not initialized');
    }

    const client = await this.pool.connect();
    try {
      const result = await client.query(sql, params);
      return result.rows;
    } catch (error) {
      logger.error('PostgreSQL query error', {
        error: error instanceof Error ? error.message : error,
      });
      throw error;
    } finally {
      client.release();
    }
  }

  async saveGameStats(gameStats: GameStats): Promise<void> {
    if (!this.pool) {
      throw new Error('Database not initialized');
    }

    const client = await this.pool.connect();
    try {
      await client.query(
        `
        INSERT INTO game_stats 
        (game_id, game_type, start_time, end_time, duration, players, winner, total_moves, status, updated_at)
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, NOW())
        ON CONFLICT (game_id) DO UPDATE SET
          game_type = EXCLUDED.game_type,
          start_time = EXCLUDED.start_time,
          end_time = EXCLUDED.end_time,
          duration = EXCLUDED.duration,
          players = EXCLUDED.players,
          winner = EXCLUDED.winner,
          total_moves = EXCLUDED.total_moves,
          status = EXCLUDED.status,
          updated_at = NOW()
      `,
        [
          gameStats.gameId,
          gameStats.gameType,
          gameStats.startTime,
          gameStats.endTime || null,
          gameStats.duration || null,
          JSON.stringify(gameStats.players),
          gameStats.winner || null,
          gameStats.totalMoves,
          gameStats.status,
        ]
      );
    } finally {
      client.release();
    }
  }

  async getGameStats(gameId: string): Promise<GameStats | null> {
    if (!this.pool) {
      throw new Error('Database not initialized');
    }

    const client = await this.pool.connect();
    try {
      const result = await client.query('SELECT * FROM game_stats WHERE game_id = $1', [gameId]);

      if (result.rows.length === 0) {
        return null;
      }

      const row = result.rows[0];
      return {
        gameId: row.game_id,
        gameType: row.game_type,
        startTime: parseInt(row.start_time),
        endTime: row.end_time ? parseInt(row.end_time) : undefined,
        duration: row.duration ? parseInt(row.duration) : undefined,
        players: JSON.parse(row.players),
        winner: row.winner || undefined,
        totalMoves: row.total_moves,
        status: row.status,
      };
    } finally {
      client.release();
    }
  }

  async getAllGameStats(): Promise<GameStats[]> {
    if (!this.pool) {
      throw new Error('Database not initialized');
    }

    const client = await this.pool.connect();
    try {
      const result = await client.query('SELECT * FROM game_stats ORDER BY start_time DESC');

      return result.rows.map(row => ({
        gameId: row.game_id,
        gameType: row.game_type,
        startTime: parseInt(row.start_time),
        endTime: row.end_time ? parseInt(row.end_time) : undefined,
        duration: row.duration ? parseInt(row.duration) : undefined,
        players: JSON.parse(row.players),
        winner: row.winner || undefined,
        totalMoves: row.total_moves,
        status: row.status,
      }));
    } finally {
      client.release();
    }
  }

  async getGameStatsByType(gameType: string): Promise<GameStats[]> {
    if (!this.pool) {
      throw new Error('Database not initialized');
    }

    const client = await this.pool.connect();
    try {
      const result = await client.query(
        'SELECT * FROM game_stats WHERE game_type = $1 ORDER BY start_time DESC',
        [gameType]
      );

      return result.rows.map(row => ({
        gameId: row.game_id,
        gameType: row.game_type,
        startTime: parseInt(row.start_time),
        endTime: row.end_time ? parseInt(row.end_time) : undefined,
        duration: row.duration ? parseInt(row.duration) : undefined,
        players: JSON.parse(row.players),
        winner: row.winner || undefined,
        totalMoves: row.total_moves,
        status: row.status,
      }));
    } finally {
      client.release();
    }
  }

  async logActivity(activity: Omit<ActivityLog, 'id'>): Promise<void> {
    if (!this.pool) {
      throw new Error('Database not initialized');
    }

    const client = await this.pool.connect();
    try {
      await client.query(
        `
        INSERT INTO activity_log (game_id, game_type, action, timestamp, players)
        VALUES ($1, $2, $3, $4, $5)
      `,
        [
          activity.gameId,
          activity.gameType,
          activity.action,
          activity.timestamp,
          activity.players || null,
        ]
      );
    } finally {
      client.release();
    }
  }

  async getActivityLog(limit: number = 100): Promise<ActivityLog[]> {
    if (!this.pool) {
      throw new Error('Database not initialized');
    }

    const client = await this.pool.connect();
    try {
      const result = await client.query(
        `
        SELECT * FROM activity_log 
        ORDER BY timestamp DESC 
        LIMIT $1
      `,
        [limit]
      );

      return result.rows.map(row => ({
        id: row.id,
        gameId: row.game_id,
        gameType: row.game_type,
        action: row.action,
        timestamp: parseInt(row.timestamp),
        players: row.players || undefined,
      }));
    } finally {
      client.release();
    }
  }

  async deleteOldActivity(olderThanDays: number): Promise<void> {
    if (!this.pool) {
      throw new Error('Database not initialized');
    }

    const cutoffTime = Date.now() - olderThanDays * 24 * 60 * 60 * 1000;
    const client = await this.pool.connect();
    try {
      await client.query('DELETE FROM activity_log WHERE timestamp < $1', [cutoffTime]);
    } finally {
      client.release();
    }
  }

  async deleteGameStats(gameId: string): Promise<void> {
    if (!this.pool) {
      throw new Error('Database not initialized');
    }

    const client = await this.pool.connect();
    try {
      await client.query('DELETE FROM game_stats WHERE game_id = $1', [gameId]);
    } finally {
      client.release();
    }
  }
}

export function createDatabaseProvider(config: DatabaseConfig): DatabaseProvider {
  switch (config.type) {
    case 'sqlite':
      return new SQLiteProvider(config.sqlitePath);
    case 'postgresql':
      if (!config.connectionString) {
        throw new Error('PostgreSQL connection string is required');
      }
      return new PostgreSQLProvider(config.connectionString);
    default:
      throw new Error(`Unsupported database type: ${(config as any).type}`);
  }
}
