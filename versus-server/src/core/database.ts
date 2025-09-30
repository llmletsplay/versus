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

export interface GameStateData {
  gameId: string;
  gameType: string;
  gameState: any;
  moveHistory: any[];
  players: string[];
  status: 'active' | 'waiting' | 'completed' | 'abandoned';
}

// CRITICAL: Abstract database provider - defines all database operations
// PERF: Abstraction allows switching between SQLite and PostgreSQL
export abstract class DatabaseProvider {
  // CRITICAL: Database initialization - must succeed for app to function
  abstract initialize(): Promise<void>;
  // CRITICAL: Cleanup database connections
  abstract close(): Promise<void>;

  // SECURITY: Generic query operations for auth and other custom queries
  // PERF: Parameterized queries prevent SQL injection
  abstract query(_sql: string, _params?: any[]): Promise<any[]>;

  // Game state operations
  abstract saveGameState(_gameStateData: GameStateData): Promise<void>;
  abstract getGameState(_gameId: string): Promise<GameStateData | null>;
  abstract deleteGameState(_gameId: string): Promise<void>;
  abstract getActiveGames(): Promise<GameStateData[]>;
  abstract getGamesByPlayer(_playerId: string): Promise<GameStateData[]>;

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

// PERF: SQLite provider for development and small deployments
// CRITICAL: File-based database for persistent storage
export class SQLiteProvider extends DatabaseProvider {
  private db: Database.Database | null = null;
  private dbPath: string;

  constructor(dbPath: string = './game_data/stats.db') {
    super();
    this.dbPath = dbPath;
  }

  // CRITICAL: SQLite database initialization with schema creation
  // PERF: Uses WAL mode for better concurrent access
  async initialize(): Promise<void> {
    try {
      // PERF: Enable WAL mode for better concurrency
      this.db = new Database(this.dbPath);
      this.db.pragma('journal_mode = WAL');
      this.db.pragma('synchronous = NORMAL');
      this.db.pragma('cache_size = 1000');
      this.db.pragma('temp_store = memory');

      // CRITICAL: Create tables if they don't exist
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

        CREATE TABLE IF NOT EXISTS game_states (
          game_id TEXT PRIMARY KEY,
          game_type TEXT NOT NULL,
          game_state TEXT NOT NULL,
          move_history TEXT NOT NULL DEFAULT '[]',
          players TEXT NOT NULL,
          status TEXT NOT NULL CHECK (status IN ('active', 'waiting', 'completed', 'abandoned')) DEFAULT 'waiting',
          created_at INTEGER NOT NULL DEFAULT (strftime('%s', 'now')),
          updated_at INTEGER NOT NULL DEFAULT (strftime('%s', 'now'))
        );
        
        -- PERF: Indexes for query optimization
        CREATE INDEX IF NOT EXISTS idx_game_stats_type ON game_stats(game_type);
        CREATE INDEX IF NOT EXISTS idx_game_stats_status ON game_stats(status);
        CREATE INDEX IF NOT EXISTS idx_activity_timestamp ON activity_log(timestamp);
        CREATE INDEX IF NOT EXISTS idx_activity_game_type ON activity_log(game_type);
        CREATE INDEX IF NOT EXISTS idx_game_states_type ON game_states(game_type);
        CREATE INDEX IF NOT EXISTS idx_game_states_status ON game_states(status);
        CREATE INDEX IF NOT EXISTS idx_game_states_updated ON game_states(updated_at);

        -- PERF: Additional performance indexes
        CREATE INDEX IF NOT EXISTS idx_game_stats_start_time ON game_stats(start_time DESC);
        CREATE INDEX IF NOT EXISTS idx_activity_log_game_id ON activity_log(game_id);
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

  // PERF: SQLite query execution with prepared statements
  // SECURITY: Parameterized queries prevent SQL injection
  async query(sql: string, params: any[] = []): Promise<any[]> {
    if (!this.db) {
      throw new Error('Database not initialized');
    }

    try {
      // PERF: Use prepared statements for better performance
      if (sql.trim().toLowerCase().startsWith('select')) {
        const stmt = this.db.prepare(sql);
        return stmt.all(...params);
      } else {
        // PERF: For INSERT, UPDATE, DELETE operations
        const stmt = this.db.prepare(sql);
        stmt.run(...params);
        return [];
      }
    } catch (error) {
      logger.error('SQLite query error', { error: error instanceof Error ? error.message : error });
      throw error;
    }
  }

  async saveGameState(gameStateData: GameStateData): Promise<void> {
    if (!this.db) {
      throw new Error('Database not initialized');
    }

    const stmt = this.db.prepare(`
      INSERT OR REPLACE INTO game_states
      (game_id, game_type, game_state, move_history, players, status, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, strftime('%s', 'now'))
    `);

    stmt.run(
      gameStateData.gameId,
      gameStateData.gameType,
      JSON.stringify(gameStateData.gameState),
      JSON.stringify(gameStateData.moveHistory),
      JSON.stringify(gameStateData.players),
      gameStateData.status
    );
  }

  async getGameState(gameId: string): Promise<GameStateData | null> {
    if (!this.db) {
      return null;
    }

    const stmt = this.db.prepare('SELECT * FROM game_states WHERE game_id = ?');
    const row = stmt.get(gameId);

    if (!row) {
      return null;
    }

    return {
      gameId: (row as any).game_id,
      gameType: (row as any).game_type,
      gameState: JSON.parse((row as any).game_state),
      moveHistory: JSON.parse((row as any).move_history),
      players: JSON.parse((row as any).players),
      status: (row as any).status,
    };
  }

  async deleteGameState(gameId: string): Promise<void> {
    if (!this.db) {
      return;
    }

    const stmt = this.db.prepare('DELETE FROM game_states WHERE game_id = ?');
    stmt.run(gameId);
  }

  async getActiveGames(): Promise<GameStateData[]> {
    if (!this.db) {
      return [];
    }

    const stmt = this.db.prepare(
      "SELECT * FROM game_states WHERE status IN ('active', 'waiting') ORDER BY updated_at DESC"
    );
    const rows = stmt.all();

    return rows.map(row => ({
      gameId: (row as any).game_id,
      gameType: (row as any).game_type,
      gameState: JSON.parse((row as any).game_state),
      moveHistory: JSON.parse((row as any).move_history),
      players: JSON.parse((row as any).players),
      status: (row as any).status,
    }));
  }

  async getGamesByPlayer(playerId: string): Promise<GameStateData[]> {
    if (!this.db) {
      return [];
    }

    const stmt = this.db.prepare(
      'SELECT * FROM game_states WHERE players LIKE ? ORDER BY updated_at DESC'
    );
    const rows = stmt.all(`%"${playerId}"%`);

    return rows.map(row => ({
      gameId: (row as any).game_id,
      gameType: (row as any).game_type,
      gameState: JSON.parse((row as any).game_state),
      moveHistory: JSON.parse((row as any).move_history),
      players: JSON.parse((row as any).players),
      status: (row as any).status,
    }));
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

// PERF: PostgreSQL provider for production deployments
// CRITICAL: Connection pooling for high-performance database operations
export class PostgreSQLProvider extends DatabaseProvider {
  private pool: Pool | null = null;
  private connectionString: string;

  constructor(connectionString: string) {
    super();
    this.connectionString = connectionString;
  }

  async initialize(): Promise<void> {
    // PERF: Connection pool configuration - CRITICAL
    this.pool = new Pool({
      connectionString: this.connectionString,
      // PERF: Connection pool settings for production
      max: 20, // Maximum number of clients in the pool
      min: 2, // Minimum number of clients in the pool
      idleTimeoutMillis: 30000, // Close idle clients after 30 seconds
      connectionTimeoutMillis: 2000, // Return error after 2 seconds if connection cannot be established
      maxUses: 7500, // Close connection after 7500 uses for load balancing
      // SECURITY: Enable SSL in production
      ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: true } : false,
      // PERF: Statement timeout to prevent long-running queries
      statement_timeout: 10000, // 10 seconds
      query_timeout: 10000, // 10 seconds
      // PERF: Connection pool error handling
      allowExitOnIdle: false, // Keep process alive even if pool is idle
    });

    // PERF: Pool error handling
    this.pool.on('error', (err, _client) => {
      logger.error('Unexpected PostgreSQL pool error:', err);
    });

    // PERF: Monitor pool statistics
    if (process.env.NODE_ENV !== 'production') {
      setInterval(() => {
        if (this.pool) {
          const { totalCount, idleCount, waitingCount } = this.pool;
          logger.debug(
            `Pool stats - Total: ${totalCount}, Idle: ${idleCount}, Waiting: ${waitingCount}`
          );
        }
      }, 30000); // Log every 30 seconds in development
    }

    // Create tables if they don't exist
    const client = await this.pool.connect();
    try {
      // PERF: Use transaction for table creation
      await client.query('BEGIN');

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

        CREATE TABLE IF NOT EXISTS game_states (
          game_id VARCHAR(255) PRIMARY KEY,
          game_type VARCHAR(100) NOT NULL,
          game_state TEXT NOT NULL,
          move_history TEXT NOT NULL DEFAULT '[]',
          players TEXT NOT NULL,
          status VARCHAR(20) NOT NULL CHECK (status IN ('active', 'waiting', 'completed', 'abandoned')) DEFAULT 'waiting',
          created_at TIMESTAMP NOT NULL DEFAULT NOW(),
          updated_at TIMESTAMP NOT NULL DEFAULT NOW()
        );
        
        CREATE INDEX IF NOT EXISTS idx_game_stats_type ON game_stats(game_type);
        CREATE INDEX IF NOT EXISTS idx_game_stats_status ON game_stats(status);
        CREATE INDEX IF NOT EXISTS idx_activity_timestamp ON activity_log(timestamp);
        CREATE INDEX IF NOT EXISTS idx_activity_game_type ON activity_log(game_type);
        CREATE INDEX IF NOT EXISTS idx_game_states_type ON game_states(game_type);
        CREATE INDEX IF NOT EXISTS idx_game_states_status ON game_states(status);
        CREATE INDEX IF NOT EXISTS idx_game_states_updated ON game_states(updated_at);

        -- PERF: Additional performance indexes
        CREATE INDEX IF NOT EXISTS idx_game_stats_players ON game_stats(players);
        CREATE INDEX IF NOT EXISTS idx_game_states_players ON game_states(players);
        CREATE INDEX IF NOT EXISTS idx_activity_game_id ON activity_log(game_id);
        CREATE INDEX IF NOT EXISTS idx_game_stats_created ON game_stats(created_at DESC);
      `);

      await client.query('COMMIT');
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
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

  // PERF: PostgreSQL query execution with connection pooling
  // SECURITY: Parameterized queries and injection detection
  async query(sql: string, params: any[] = []): Promise<any[]> {
    if (!this.pool) {
      throw new Error('Database not initialized');
    }

    // PERF: Use pool.query directly for better connection management
    // Connection pooling automatically handles connection lifecycle
    try {
      // SECURITY: SQL injection prevention layer
      // Basic detection for common injection patterns
      if (params.some(p => typeof p === 'string' && (p.includes(';') || p.includes('--')))) {
        logger.warn('Potential SQL injection attempt detected', { params });
      }

      // PERF: Pool manages connections automatically
      // No need to manually acquire/release connections
      const result = await this.pool.query(sql, params);
      return result.rows;
    } catch (error) {
      // SECURITY: Sanitize error messages to prevent information leakage
      logger.error('PostgreSQL query error', {
        error: error instanceof Error ? error.message : 'Unknown error',
        // SECURITY: Don't log SQL in production to prevent exposure
        ...(process.env.NODE_ENV !== 'production' && { sql, params }),
      });
      throw new Error('Database operation failed');
    }
  }

  async saveGameState(gameStateData: GameStateData): Promise<void> {
    if (!this.pool) {
      throw new Error('Database not initialized');
    }

    const client = await this.pool.connect();
    try {
      await client.query(
        `INSERT INTO game_states
         (game_id, game_type, game_state, move_history, players, status, updated_at)
         VALUES ($1, $2, $3, $4, $5, $6, NOW())
         ON CONFLICT (game_id)
         DO UPDATE SET
           game_state = EXCLUDED.game_state,
           move_history = EXCLUDED.move_history,
           players = EXCLUDED.players,
           status = EXCLUDED.status,
           updated_at = NOW()`,
        [
          gameStateData.gameId,
          gameStateData.gameType,
          JSON.stringify(gameStateData.gameState),
          JSON.stringify(gameStateData.moveHistory),
          JSON.stringify(gameStateData.players),
          gameStateData.status,
        ]
      );
    } catch (error) {
      logger.error('Error saving game state', { gameId: gameStateData.gameId, error });
      throw error;
    } finally {
      client.release();
    }
  }

  async getGameState(gameId: string): Promise<GameStateData | null> {
    if (!this.pool) {
      return null;
    }

    const client = await this.pool.connect();
    try {
      const result = await client.query('SELECT * FROM game_states WHERE game_id = $1', [gameId]);

      if (result.rows.length === 0) {
        return null;
      }

      const row = result.rows[0];
      return {
        gameId: row.game_id,
        gameType: row.game_type,
        gameState: JSON.parse(row.game_state),
        moveHistory: JSON.parse(row.move_history),
        players: JSON.parse(row.players),
        status: row.status,
      };
    } catch (error) {
      logger.error('Error getting game state', { gameId, error });
      return null;
    } finally {
      client.release();
    }
  }

  async deleteGameState(gameId: string): Promise<void> {
    if (!this.pool) {
      return;
    }

    const client = await this.pool.connect();
    try {
      await client.query('DELETE FROM game_states WHERE game_id = $1', [gameId]);
    } catch (error) {
      logger.error('Error deleting game state', { gameId, error });
      throw error;
    } finally {
      client.release();
    }
  }

  async getActiveGames(): Promise<GameStateData[]> {
    if (!this.pool) {
      return [];
    }

    const client = await this.pool.connect();
    try {
      const result = await client.query(
        "SELECT * FROM game_states WHERE status IN ('active', 'waiting') ORDER BY updated_at DESC"
      );

      return result.rows.map(row => ({
        gameId: row.game_id,
        gameType: row.game_type,
        gameState: JSON.parse(row.game_state),
        moveHistory: JSON.parse(row.move_history),
        players: JSON.parse(row.players),
        status: row.status,
      }));
    } catch (error) {
      logger.error('Error getting active games', { error });
      return [];
    } finally {
      client.release();
    }
  }

  async getGamesByPlayer(playerId: string): Promise<GameStateData[]> {
    if (!this.pool) {
      return [];
    }

    const client = await this.pool.connect();
    try {
      const result = await client.query(
        'SELECT * FROM game_states WHERE players LIKE $1 ORDER BY updated_at DESC',
        [`%"${playerId}"%`]
      );

      return result.rows.map(row => ({
        gameId: row.game_id,
        gameType: row.game_type,
        gameState: JSON.parse(row.game_state),
        moveHistory: JSON.parse(row.move_history),
        players: JSON.parse(row.players),
        status: row.status,
      }));
    } catch (error) {
      logger.error('Error getting games by player', { playerId, error });
      return [];
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

// CRITICAL: Database provider factory - selects appropriate database backend
// PERF: SQLite for development, PostgreSQL for production
export function createDatabaseProvider(config: DatabaseConfig): DatabaseProvider {
  switch (config.type) {
    case 'sqlite':
      // PERF: SQLite for development and small deployments
      return new SQLiteProvider(config.sqlitePath);
    case 'postgresql':
      // PERF: PostgreSQL for production with connection pooling
      if (!config.connectionString) {
        throw new Error('PostgreSQL connection string is required');
      }
      return new PostgreSQLProvider(config.connectionString);
    default:
      throw new Error(`Unsupported database type: ${(config as any).type}`);
  }
}
