import Database from 'better-sqlite3';
import { Pool } from 'pg';
import type { GameStats } from './stats-service.js';
import { logger } from '../utils/logger.js';

type SupportedDialects = 'sqlite' | 'postgresql';

export interface ExecuteResult {
  rowsAffected: number;
  lastInsertId?: number | string | bigint;
}

function normalizeSQLiteSql(sql: string): string {
  return sql.replace(/\$(\d+)/g, '?');
}

function normalizePostgresSql(sql: string): string {
  if (!sql.includes('?')) {
    return sql;
  }

  let index = 0;
  return sql.replace(/\?/g, () => `$${++index}`);
}

export interface DatabaseConfig {
  type: SupportedDialects;
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
  protected readonly dialect: SupportedDialects;

  protected constructor(dialect: SupportedDialects) {
    this.dialect = dialect;
  }

  getDialect(): SupportedDialects {
    return this.dialect;
  }

  // CRITICAL: Database initialization - must succeed for app to function
  abstract initialize(): Promise<void>;
  // CRITICAL: Cleanup database connections
  abstract close(): Promise<void>;

  // SECURITY: Generic query operations for auth and other custom queries
  // PERF: Parameterized queries prevent SQL injection
  abstract query<T = any>(_sql: string, _params?: any[]): Promise<T[]>;
  abstract get<T = any>(_sql: string, _params?: any[]): Promise<T | null>;
  abstract execute(_sql: string, _params?: any[]): Promise<ExecuteResult>;

  async all<T = any>(sql: string, params: any[] = []): Promise<T[]> {
    return this.query<T>(sql, params);
  }

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
    super('sqlite');
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

      // Platform expansion tables
      this.db.exec(`
        -- ── Rooms ────────────────────────────────────────────────
        CREATE TABLE IF NOT EXISTS rooms (
          id TEXT PRIMARY KEY,
          game_type TEXT NOT NULL,
          status TEXT NOT NULL DEFAULT 'waiting'
            CHECK (status IN ('waiting', 'ready', 'in_progress', 'completed', 'cancelled')),
          creator_id TEXT NOT NULL,
          min_players INTEGER NOT NULL DEFAULT 2,
          max_players INTEGER NOT NULL DEFAULT 2,
          is_public INTEGER NOT NULL DEFAULT 1,
          is_ranked INTEGER NOT NULL DEFAULT 0,
          spectators_allowed INTEGER NOT NULL DEFAULT 1,
          wager_amount REAL,
          wager_currency TEXT,
          escrow_address TEXT,
          game_id TEXT,
          game_config TEXT,
          market_id TEXT,
          tournament_match_id TEXT,
          created_at INTEGER NOT NULL DEFAULT (strftime('%s', 'now')),
          updated_at INTEGER NOT NULL DEFAULT (strftime('%s', 'now'))
        );

        CREATE INDEX IF NOT EXISTS idx_rooms_status ON rooms(status);
        CREATE INDEX IF NOT EXISTS idx_rooms_game_type ON rooms(game_type);
        CREATE INDEX IF NOT EXISTS idx_rooms_creator ON rooms(creator_id);
        CREATE INDEX IF NOT EXISTS idx_rooms_public_waiting ON rooms(is_public, status)
          WHERE status = 'waiting';

        -- ── Room Participants ────────────────────────────────────
        CREATE TABLE IF NOT EXISTS room_participants (
          room_id TEXT NOT NULL,
          user_id TEXT NOT NULL,
          agent_id TEXT,
          role TEXT NOT NULL DEFAULT 'player'
            CHECK (role IN ('player', 'spectator')),
          ready_status TEXT NOT NULL DEFAULT 'not_ready'
            CHECK (ready_status IN ('not_ready', 'ready')),
          elo_at_join INTEGER,
          joined_at INTEGER NOT NULL DEFAULT (strftime('%s', 'now')),
          PRIMARY KEY (room_id, user_id)
        );

        CREATE INDEX IF NOT EXISTS idx_room_participants_user ON room_participants(user_id);
        CREATE INDEX IF NOT EXISTS idx_room_participants_room ON room_participants(room_id);

        -- ── Agent Registry ───────────────────────────────────────
        CREATE TABLE IF NOT EXISTS agent_registry (
          id TEXT PRIMARY KEY,
          display_name TEXT NOT NULL,
          owner_user_id TEXT NOT NULL,
          provider TEXT NOT NULL CHECK (provider IN ('openclaw', 'mcp', 'api')),
          provider_agent_id TEXT,
          games_supported TEXT NOT NULL DEFAULT '[]',
          elo_ratings TEXT NOT NULL DEFAULT '{}',
          is_active INTEGER NOT NULL DEFAULT 1,
          total_games INTEGER NOT NULL DEFAULT 0,
          wins INTEGER NOT NULL DEFAULT 0,
          losses INTEGER NOT NULL DEFAULT 0,
          draws INTEGER NOT NULL DEFAULT 0,
          last_seen_at INTEGER,
          created_at INTEGER NOT NULL DEFAULT (strftime('%s', 'now')),
          updated_at INTEGER NOT NULL DEFAULT (strftime('%s', 'now'))
        );

        CREATE INDEX IF NOT EXISTS idx_agent_registry_owner ON agent_registry(owner_user_id);
        CREATE INDEX IF NOT EXISTS idx_agent_registry_provider ON agent_registry(provider);
        CREATE INDEX IF NOT EXISTS idx_agent_registry_active ON agent_registry(is_active);

        -- ── Player Ratings (ELO per game type) ───────────────────
        CREATE TABLE IF NOT EXISTS player_ratings (
          user_id TEXT NOT NULL,
          game_type TEXT NOT NULL,
          elo_rating INTEGER NOT NULL DEFAULT 1200,
          games_played INTEGER NOT NULL DEFAULT 0,
          wins INTEGER NOT NULL DEFAULT 0,
          losses INTEGER NOT NULL DEFAULT 0,
          draws INTEGER NOT NULL DEFAULT 0,
          peak_rating INTEGER NOT NULL DEFAULT 1200,
          current_streak INTEGER NOT NULL DEFAULT 0,
          updated_at INTEGER NOT NULL DEFAULT (strftime('%s', 'now')),
          PRIMARY KEY (user_id, game_type)
        );

        CREATE INDEX IF NOT EXISTS idx_player_ratings_elo ON player_ratings(game_type, elo_rating DESC);

        -- ── Escrow Transactions ──────────────────────────────────
        CREATE TABLE IF NOT EXISTS escrow_transactions (
          id TEXT PRIMARY KEY,
          room_id TEXT NOT NULL,
          game_id TEXT,
          contract_address TEXT,
          chain_id INTEGER NOT NULL DEFAULT 8453,
          total_amount REAL NOT NULL DEFAULT 0,
          token TEXT NOT NULL DEFAULT 'USDC',
          platform_fee_percent REAL NOT NULL DEFAULT 2.5,
          status TEXT NOT NULL DEFAULT 'pending'
            CHECK (status IN ('pending', 'funded', 'released', 'refunded', 'disputed', 'cancelled')),
          winner_address TEXT,
          result_signature TEXT,
          created_at INTEGER NOT NULL DEFAULT (strftime('%s', 'now')),
          resolved_at INTEGER
        );

        CREATE INDEX IF NOT EXISTS idx_escrow_room ON escrow_transactions(room_id);
        CREATE INDEX IF NOT EXISTS idx_escrow_status ON escrow_transactions(status);

        -- ── Escrow Deposits (individual player deposits) ─────────
        CREATE TABLE IF NOT EXISTS escrow_deposits (
          id TEXT PRIMARY KEY,
          escrow_id TEXT NOT NULL,
          user_id TEXT NOT NULL,
          wallet_address TEXT NOT NULL,
          amount REAL NOT NULL,
          token TEXT NOT NULL,
          tx_hash TEXT,
          status TEXT NOT NULL DEFAULT 'pending'
            CHECK (status IN ('pending', 'confirmed', 'failed')),
          created_at INTEGER NOT NULL DEFAULT (strftime('%s', 'now')),
          confirmed_at INTEGER
        );

        CREATE INDEX IF NOT EXISTS idx_escrow_deposits_escrow ON escrow_deposits(escrow_id);
        CREATE INDEX IF NOT EXISTS idx_escrow_deposits_user ON escrow_deposits(user_id);

        -- ── Prediction Markets ───────────────────────────────────
        CREATE TABLE IF NOT EXISTS prediction_markets (
          id TEXT PRIMARY KEY,
          market_type TEXT NOT NULL
            CHECK (market_type IN ('match_outcome', 'tournament_winner', 'in_game_prop', 'agent_vs_agent')),
          room_id TEXT,
          tournament_id TEXT,
          question TEXT NOT NULL,
          outcomes TEXT NOT NULL DEFAULT '[]',
          status TEXT NOT NULL DEFAULT 'open'
            CHECK (status IN ('open', 'locked', 'resolved', 'cancelled')),
          resolution_source TEXT NOT NULL DEFAULT 'game_result'
            CHECK (resolution_source IN ('game_result', 'tournament_result', 'oracle', 'admin')),
          total_pool REAL NOT NULL DEFAULT 0,
          outcome_pools TEXT NOT NULL DEFAULT '[]',
          token TEXT NOT NULL DEFAULT 'USDC',
          winning_outcome_index INTEGER NOT NULL DEFAULT -1,
          created_at INTEGER NOT NULL DEFAULT (strftime('%s', 'now')),
          closes_at INTEGER NOT NULL,
          resolved_at INTEGER
        );

        CREATE INDEX IF NOT EXISTS idx_markets_status ON prediction_markets(status);
        CREATE INDEX IF NOT EXISTS idx_markets_room ON prediction_markets(room_id);
        CREATE INDEX IF NOT EXISTS idx_markets_tournament ON prediction_markets(tournament_id);

        -- ── Market Positions (individual bets) ───────────────────
        CREATE TABLE IF NOT EXISTS market_positions (
          id TEXT PRIMARY KEY,
          market_id TEXT NOT NULL,
          user_id TEXT NOT NULL,
          outcome_index INTEGER NOT NULL,
          amount REAL NOT NULL,
          token TEXT NOT NULL DEFAULT 'USDC',
          potential_payout REAL NOT NULL DEFAULT 0,
          settled INTEGER NOT NULL DEFAULT 0,
          payout REAL NOT NULL DEFAULT 0,
          created_at INTEGER NOT NULL DEFAULT (strftime('%s', 'now'))
        );

        CREATE INDEX IF NOT EXISTS idx_positions_market ON market_positions(market_id);
        CREATE INDEX IF NOT EXISTS idx_positions_user ON market_positions(user_id);

        -- ── Tournaments ──────────────────────────────────────────
        CREATE TABLE IF NOT EXISTS tournaments (
          id TEXT PRIMARY KEY,
          name TEXT NOT NULL,
          game_type TEXT NOT NULL,
          format TEXT NOT NULL
            CHECK (format IN ('single_elimination', 'round_robin', 'swiss')),
          status TEXT NOT NULL DEFAULT 'registration'
            CHECK (status IN ('registration', 'in_progress', 'completed', 'cancelled')),
          entry_fee REAL NOT NULL DEFAULT 0,
          entry_fee_token TEXT NOT NULL DEFAULT 'USDC',
          prize_pool REAL NOT NULL DEFAULT 0,
          max_participants INTEGER NOT NULL,
          current_participants INTEGER NOT NULL DEFAULT 0,
          current_round INTEGER NOT NULL DEFAULT 0,
          total_rounds INTEGER NOT NULL DEFAULT 0,
          game_config TEXT,
          market_id TEXT,
          created_at INTEGER NOT NULL DEFAULT (strftime('%s', 'now')),
          started_at INTEGER,
          ended_at INTEGER
        );

        CREATE INDEX IF NOT EXISTS idx_tournaments_status ON tournaments(status);
        CREATE INDEX IF NOT EXISTS idx_tournaments_game_type ON tournaments(game_type);

        -- ── Tournament Participants ──────────────────────────────
        CREATE TABLE IF NOT EXISTS tournament_participants (
          tournament_id TEXT NOT NULL,
          user_id TEXT NOT NULL,
          agent_id TEXT,
          seed INTEGER NOT NULL DEFAULT 0,
          current_round INTEGER NOT NULL DEFAULT 0,
          eliminated INTEGER NOT NULL DEFAULT 0,
          wins INTEGER NOT NULL DEFAULT 0,
          losses INTEGER NOT NULL DEFAULT 0,
          draws INTEGER NOT NULL DEFAULT 0,
          points REAL NOT NULL DEFAULT 0,
          registered_at INTEGER NOT NULL DEFAULT (strftime('%s', 'now')),
          PRIMARY KEY (tournament_id, user_id)
        );

        CREATE INDEX IF NOT EXISTS idx_tournament_participants_user ON tournament_participants(user_id);

        -- ── Tournament Matches ───────────────────────────────────
        CREATE TABLE IF NOT EXISTS tournament_matches (
          id TEXT PRIMARY KEY,
          tournament_id TEXT NOT NULL,
          round INTEGER NOT NULL,
          match_number INTEGER NOT NULL,
          room_id TEXT,
          player_a_id TEXT NOT NULL,
          player_b_id TEXT,
          winner_id TEXT,
          status TEXT NOT NULL DEFAULT 'pending'
            CHECK (status IN ('pending', 'in_progress', 'completed', 'bye')),
          created_at INTEGER NOT NULL DEFAULT (strftime('%s', 'now')),
          completed_at INTEGER
        );

        CREATE INDEX IF NOT EXISTS idx_tournament_matches_tournament ON tournament_matches(tournament_id);
        CREATE INDEX IF NOT EXISTS idx_tournament_matches_round ON tournament_matches(tournament_id, round);
        CREATE INDEX IF NOT EXISTS idx_tournament_matches_room ON tournament_matches(room_id);
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
  async query<T = any>(sql: string, params: any[] = []): Promise<T[]> {
    if (!this.db) {
      throw new Error('Database not initialized');
    }

    try {
      const normalizedSql = normalizeSQLiteSql(sql);
      // PERF: Use prepared statements for better performance
      if (normalizedSql.trim().toLowerCase().startsWith('select')) {
        const stmt = this.db.prepare(normalizedSql);
        return stmt.all(...params) as T[];
      } else {
        // PERF: For INSERT, UPDATE, DELETE operations
        const stmt = this.db.prepare(normalizedSql);
        stmt.run(...params);
        return [];
      }
    } catch (error) {
      logger.error('SQLite query error', { error: error instanceof Error ? error.message : error });
      throw error;
    }
  }

  async get<T = any>(sql: string, params: any[] = []): Promise<T | null> {
    if (!this.db) {
      throw new Error('Database not initialized');
    }

    try {
      const stmt = this.db.prepare(normalizeSQLiteSql(sql));
      const row = stmt.get(...params);
      return (row as T) ?? null;
    } catch (error) {
      logger.error('SQLite get error', { error: error instanceof Error ? error.message : error });
      throw error;
    }
  }

  async execute(sql: string, params: any[] = []): Promise<ExecuteResult> {
    if (!this.db) {
      throw new Error('Database not initialized');
    }

    try {
      const stmt = this.db.prepare(normalizeSQLiteSql(sql));
      const result = stmt.run(...params);
      return {
        rowsAffected: result.changes,
        lastInsertId: result.lastInsertRowid,
      };
    } catch (error) {
      logger.error('SQLite execute error', {
        error: error instanceof Error ? error.message : error,
      });
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

    return rows.map((row) => ({
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

    return rows.map((row) => ({
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

    return rows.map((row) => ({
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

    return rows.map((row) => ({
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

    return rows.map((row) => ({
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
    super('postgresql');
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

      // Platform expansion tables
      await client.query(`
        -- ── Rooms ────────────────────────────────────────────────
        CREATE TABLE IF NOT EXISTS rooms (
          id VARCHAR(255) PRIMARY KEY,
          game_type VARCHAR(100) NOT NULL,
          status VARCHAR(20) NOT NULL DEFAULT 'waiting'
            CHECK (status IN ('waiting', 'ready', 'in_progress', 'completed', 'cancelled')),
          creator_id VARCHAR(255) NOT NULL,
          min_players INTEGER NOT NULL DEFAULT 2,
          max_players INTEGER NOT NULL DEFAULT 2,
          is_public BOOLEAN NOT NULL DEFAULT TRUE,
          is_ranked BOOLEAN NOT NULL DEFAULT FALSE,
          spectators_allowed BOOLEAN NOT NULL DEFAULT TRUE,
          wager_amount DECIMAL(18,8),
          wager_currency VARCHAR(20),
          escrow_address VARCHAR(255),
          game_id VARCHAR(255),
          game_config TEXT,
          market_id VARCHAR(255),
          tournament_match_id VARCHAR(255),
          created_at TIMESTAMP NOT NULL DEFAULT NOW(),
          updated_at TIMESTAMP NOT NULL DEFAULT NOW()
        );

        CREATE INDEX IF NOT EXISTS idx_rooms_status ON rooms(status);
        CREATE INDEX IF NOT EXISTS idx_rooms_game_type ON rooms(game_type);
        CREATE INDEX IF NOT EXISTS idx_rooms_creator ON rooms(creator_id);

        -- ── Room Participants ────────────────────────────────────
        CREATE TABLE IF NOT EXISTS room_participants (
          room_id VARCHAR(255) NOT NULL,
          user_id VARCHAR(255) NOT NULL,
          agent_id VARCHAR(255),
          role VARCHAR(20) NOT NULL DEFAULT 'player'
            CHECK (role IN ('player', 'spectator')),
          ready_status VARCHAR(20) NOT NULL DEFAULT 'not_ready'
            CHECK (ready_status IN ('not_ready', 'ready')),
          elo_at_join INTEGER,
          joined_at TIMESTAMP NOT NULL DEFAULT NOW(),
          PRIMARY KEY (room_id, user_id)
        );

        CREATE INDEX IF NOT EXISTS idx_room_participants_user ON room_participants(user_id);
        CREATE INDEX IF NOT EXISTS idx_room_participants_room ON room_participants(room_id);

        -- ── Agent Registry ───────────────────────────────────────
        CREATE TABLE IF NOT EXISTS agent_registry (
          id VARCHAR(255) PRIMARY KEY,
          display_name VARCHAR(255) NOT NULL,
          owner_user_id VARCHAR(255) NOT NULL,
          provider VARCHAR(20) NOT NULL CHECK (provider IN ('openclaw', 'mcp', 'api')),
          provider_agent_id VARCHAR(255),
          games_supported TEXT NOT NULL DEFAULT '[]',
          elo_ratings TEXT NOT NULL DEFAULT '{}',
          is_active BOOLEAN NOT NULL DEFAULT TRUE,
          total_games INTEGER NOT NULL DEFAULT 0,
          wins INTEGER NOT NULL DEFAULT 0,
          losses INTEGER NOT NULL DEFAULT 0,
          draws INTEGER NOT NULL DEFAULT 0,
          last_seen_at TIMESTAMP,
          created_at TIMESTAMP NOT NULL DEFAULT NOW(),
          updated_at TIMESTAMP NOT NULL DEFAULT NOW()
        );

        CREATE INDEX IF NOT EXISTS idx_agent_registry_owner ON agent_registry(owner_user_id);
        CREATE INDEX IF NOT EXISTS idx_agent_registry_provider ON agent_registry(provider);

        -- ── Player Ratings ───────────────────────────────────────
        CREATE TABLE IF NOT EXISTS player_ratings (
          user_id VARCHAR(255) NOT NULL,
          game_type VARCHAR(100) NOT NULL,
          elo_rating INTEGER NOT NULL DEFAULT 1200,
          games_played INTEGER NOT NULL DEFAULT 0,
          wins INTEGER NOT NULL DEFAULT 0,
          losses INTEGER NOT NULL DEFAULT 0,
          draws INTEGER NOT NULL DEFAULT 0,
          peak_rating INTEGER NOT NULL DEFAULT 1200,
          current_streak INTEGER NOT NULL DEFAULT 0,
          updated_at TIMESTAMP NOT NULL DEFAULT NOW(),
          PRIMARY KEY (user_id, game_type)
        );

        CREATE INDEX IF NOT EXISTS idx_player_ratings_elo ON player_ratings(game_type, elo_rating DESC);

        -- ── Escrow Transactions ──────────────────────────────────
        CREATE TABLE IF NOT EXISTS escrow_transactions (
          id VARCHAR(255) PRIMARY KEY,
          room_id VARCHAR(255) NOT NULL,
          game_id VARCHAR(255),
          contract_address VARCHAR(255),
          chain_id INTEGER NOT NULL DEFAULT 8453,
          total_amount DECIMAL(18,8) NOT NULL DEFAULT 0,
          token VARCHAR(20) NOT NULL DEFAULT 'USDC',
          platform_fee_percent DECIMAL(5,2) NOT NULL DEFAULT 2.5,
          status VARCHAR(20) NOT NULL DEFAULT 'pending'
            CHECK (status IN ('pending', 'funded', 'released', 'refunded', 'disputed', 'cancelled')),
          winner_address VARCHAR(255),
          result_signature TEXT,
          created_at TIMESTAMP NOT NULL DEFAULT NOW(),
          resolved_at TIMESTAMP
        );

        CREATE INDEX IF NOT EXISTS idx_escrow_room ON escrow_transactions(room_id);
        CREATE INDEX IF NOT EXISTS idx_escrow_status ON escrow_transactions(status);

        -- ── Escrow Deposits ──────────────────────────────────────
        CREATE TABLE IF NOT EXISTS escrow_deposits (
          id VARCHAR(255) PRIMARY KEY,
          escrow_id VARCHAR(255) NOT NULL,
          user_id VARCHAR(255) NOT NULL,
          wallet_address VARCHAR(255) NOT NULL,
          amount DECIMAL(18,8) NOT NULL,
          token VARCHAR(20) NOT NULL,
          tx_hash VARCHAR(255),
          status VARCHAR(20) NOT NULL DEFAULT 'pending'
            CHECK (status IN ('pending', 'confirmed', 'failed')),
          created_at TIMESTAMP NOT NULL DEFAULT NOW(),
          confirmed_at TIMESTAMP
        );

        CREATE INDEX IF NOT EXISTS idx_escrow_deposits_escrow ON escrow_deposits(escrow_id);
        CREATE INDEX IF NOT EXISTS idx_escrow_deposits_user ON escrow_deposits(user_id);

        -- ── Prediction Markets ───────────────────────────────────
        CREATE TABLE IF NOT EXISTS prediction_markets (
          id VARCHAR(255) PRIMARY KEY,
          market_type VARCHAR(30) NOT NULL
            CHECK (market_type IN ('match_outcome', 'tournament_winner', 'in_game_prop', 'agent_vs_agent')),
          room_id VARCHAR(255),
          tournament_id VARCHAR(255),
          question TEXT NOT NULL,
          outcomes TEXT NOT NULL DEFAULT '[]',
          status VARCHAR(20) NOT NULL DEFAULT 'open'
            CHECK (status IN ('open', 'locked', 'resolved', 'cancelled')),
          resolution_source VARCHAR(30) NOT NULL DEFAULT 'game_result'
            CHECK (resolution_source IN ('game_result', 'tournament_result', 'oracle', 'admin')),
          total_pool DECIMAL(18,8) NOT NULL DEFAULT 0,
          outcome_pools TEXT NOT NULL DEFAULT '[]',
          token VARCHAR(20) NOT NULL DEFAULT 'USDC',
          winning_outcome_index INTEGER NOT NULL DEFAULT -1,
          created_at TIMESTAMP NOT NULL DEFAULT NOW(),
          closes_at TIMESTAMP NOT NULL,
          resolved_at TIMESTAMP
        );

        CREATE INDEX IF NOT EXISTS idx_markets_status ON prediction_markets(status);
        CREATE INDEX IF NOT EXISTS idx_markets_room ON prediction_markets(room_id);
        CREATE INDEX IF NOT EXISTS idx_markets_tournament ON prediction_markets(tournament_id);

        -- ── Market Positions ─────────────────────────────────────
        CREATE TABLE IF NOT EXISTS market_positions (
          id VARCHAR(255) PRIMARY KEY,
          market_id VARCHAR(255) NOT NULL,
          user_id VARCHAR(255) NOT NULL,
          outcome_index INTEGER NOT NULL,
          amount DECIMAL(18,8) NOT NULL,
          token VARCHAR(20) NOT NULL DEFAULT 'USDC',
          potential_payout DECIMAL(18,8) NOT NULL DEFAULT 0,
          settled BOOLEAN NOT NULL DEFAULT FALSE,
          payout DECIMAL(18,8) NOT NULL DEFAULT 0,
          created_at TIMESTAMP NOT NULL DEFAULT NOW()
        );

        CREATE INDEX IF NOT EXISTS idx_positions_market ON market_positions(market_id);
        CREATE INDEX IF NOT EXISTS idx_positions_user ON market_positions(user_id);

        -- ── Tournaments ──────────────────────────────────────────
        CREATE TABLE IF NOT EXISTS tournaments (
          id VARCHAR(255) PRIMARY KEY,
          name VARCHAR(255) NOT NULL,
          game_type VARCHAR(100) NOT NULL,
          format VARCHAR(30) NOT NULL
            CHECK (format IN ('single_elimination', 'round_robin', 'swiss')),
          status VARCHAR(20) NOT NULL DEFAULT 'registration'
            CHECK (status IN ('registration', 'in_progress', 'completed', 'cancelled')),
          entry_fee DECIMAL(18,8) NOT NULL DEFAULT 0,
          entry_fee_token VARCHAR(20) NOT NULL DEFAULT 'USDC',
          prize_pool DECIMAL(18,8) NOT NULL DEFAULT 0,
          max_participants INTEGER NOT NULL,
          current_participants INTEGER NOT NULL DEFAULT 0,
          current_round INTEGER NOT NULL DEFAULT 0,
          total_rounds INTEGER NOT NULL DEFAULT 0,
          game_config TEXT,
          market_id VARCHAR(255),
          created_at TIMESTAMP NOT NULL DEFAULT NOW(),
          started_at TIMESTAMP,
          ended_at TIMESTAMP
        );

        CREATE INDEX IF NOT EXISTS idx_tournaments_status ON tournaments(status);
        CREATE INDEX IF NOT EXISTS idx_tournaments_game_type ON tournaments(game_type);

        -- ── Tournament Participants ──────────────────────────────
        CREATE TABLE IF NOT EXISTS tournament_participants (
          tournament_id VARCHAR(255) NOT NULL,
          user_id VARCHAR(255) NOT NULL,
          agent_id VARCHAR(255),
          seed INTEGER NOT NULL DEFAULT 0,
          current_round INTEGER NOT NULL DEFAULT 0,
          eliminated BOOLEAN NOT NULL DEFAULT FALSE,
          wins INTEGER NOT NULL DEFAULT 0,
          losses INTEGER NOT NULL DEFAULT 0,
          draws INTEGER NOT NULL DEFAULT 0,
          points DECIMAL(10,2) NOT NULL DEFAULT 0,
          registered_at TIMESTAMP NOT NULL DEFAULT NOW(),
          PRIMARY KEY (tournament_id, user_id)
        );

        CREATE INDEX IF NOT EXISTS idx_tournament_participants_user ON tournament_participants(user_id);

        -- ── Tournament Matches ───────────────────────────────────
        CREATE TABLE IF NOT EXISTS tournament_matches (
          id VARCHAR(255) PRIMARY KEY,
          tournament_id VARCHAR(255) NOT NULL,
          round INTEGER NOT NULL,
          match_number INTEGER NOT NULL,
          room_id VARCHAR(255),
          player_a_id VARCHAR(255) NOT NULL,
          player_b_id VARCHAR(255),
          winner_id VARCHAR(255),
          status VARCHAR(20) NOT NULL DEFAULT 'pending'
            CHECK (status IN ('pending', 'in_progress', 'completed', 'bye')),
          created_at TIMESTAMP NOT NULL DEFAULT NOW(),
          completed_at TIMESTAMP
        );

        CREATE INDEX IF NOT EXISTS idx_tournament_matches_tournament ON tournament_matches(tournament_id);
        CREATE INDEX IF NOT EXISTS idx_tournament_matches_round ON tournament_matches(tournament_id, round);
        CREATE INDEX IF NOT EXISTS idx_tournament_matches_room ON tournament_matches(room_id);
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
  async query<T = any>(sql: string, params: any[] = []): Promise<T[]> {
    if (!this.pool) {
      throw new Error('Database not initialized');
    }

    try {
      const normalizedSql = normalizePostgresSql(sql);
      const result = await this.pool.query(normalizedSql, params);
      return result.rows as T[];
    } catch (error) {
      // SECURITY: Sanitize error messages to prevent information leakage
      logger.error('PostgreSQL query error', {
        error: error instanceof Error ? error.message : 'Unknown error',
        ...(process.env.NODE_ENV !== 'production' && { sql, params }),
      });
      throw new Error('Database operation failed');
    }
  }

  async get<T = any>(sql: string, params: any[] = []): Promise<T | null> {
    const rows = await this.query<T>(sql, params);
    return rows.length > 0 ? (rows[0] as T) : null;
  }

  async execute(sql: string, params: any[] = []): Promise<ExecuteResult> {
    if (!this.pool) {
      throw new Error('Database not initialized');
    }

    try {
      const normalizedSql = normalizePostgresSql(sql);
      const result = await this.pool.query(normalizedSql, params);
      return {
        rowsAffected: result.rowCount ?? 0,
        lastInsertId:
          (result.rows && result.rows[0] && (result.rows[0].id ?? result.rows[0].insertId)) ||
          undefined,
      };
    } catch (error) {
      logger.error('PostgreSQL execute error', {
        error: error instanceof Error ? error.message : 'Unknown error',
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

      return result.rows.map((row) => ({
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

      return result.rows.map((row) => ({
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

      return result.rows.map((row) => ({
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

      return result.rows.map((row) => ({
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

      return result.rows.map((row) => ({
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
