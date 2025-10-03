/**
 * Improved Analytics Service
 * Optimized for high-throughput event processing
 */

import { DatabaseProvider } from '../core/database.js';
import { logger } from '../utils/logger.js';
import { batchInsert } from '../utils/database-optimizations.js';
import type { Result } from '../types/subscription.js';

export interface AnalyticsEvent {
  userId?: string;
  sessionId: string;
  eventType: string;
  eventName: string;
  properties?: Record<string, any>;
  timestamp: number;
  userAgent?: string;
  ip?: string;
  referrer?: string;
  gameId?: string;
}

export interface GameAnalytics {
  gameId: string;
  gameType: string;
  userId: string;
  opponentId?: string;
  movesCount: number;
  duration: number;
  result: 'win' | 'lose' | 'draw' | 'abandoned';
  isRanked: boolean;
  finalBoard?: any;
  moves?: any[];
}

export interface UserMetrics {
  userId: string;
  totalGames: number;
  totalWins: number;
  totalLosses: number;
  totalDraws: number;
  favoriteGameType: string;
  averageGameDuration: number;
  winRate: number;
  lastActive: Date;
  totalPlayTime: number;
  currentStreak: number;
  bestStreak: number;
  rating?: number;
}

export interface AnalyticsQuery {
  userId?: string;
  eventTypes?: string[];
  eventNames?: string[];
  startDate?: Date;
  endDate?: Date;
  gameType?: string;
  isRanked?: boolean;
  limit?: number;
  offset?: number;
  groupBy?: string[];
  aggregations?: {
    count?: boolean;
    sum?: string[];
    avg?: string[];
    min?: string[];
    max?: string[];
  };
}

export interface AnalyticsStats {
  totalEvents: number;
  uniqueUsers: number;
  totalGames: number;
  popularGameTypes: Array<{ gameType: string; count: number }>;
  averageSessionDuration: number;
  retentionRate: number;
  dailyActiveUsers: number;
  monthlyActiveUsers: number;
}

/**
 * Event processor for handling high-volume analytics
 */
class EventProcessor {
  private buffer: AnalyticsEvent[] = [];
  private bufferSize: number;
  private flushInterval: number;
  private db: DatabaseProvider;
  private timer?: NodeJS.Timeout;
  private isProcessing = false;

  constructor(db: DatabaseProvider, bufferSize = 1000, flushInterval = 5000) {
    this.db = db;
    this.bufferSize = bufferSize;
    this.flushInterval = flushInterval;
    this.startProcessor();
  }

  /**
   * Add event to buffer
   */
  add(event: AnalyticsEvent): void {
    this.buffer.push(event);

    if (this.buffer.length >= this.bufferSize) {
      this.flush();
    }
  }

  /**
   * Force flush all buffered events
   */
  async flush(): Promise<void> {
    if (this.isProcessing || this.buffer.length === 0) {
      return;
    }

    this.isProcessing = true;
    const events = this.buffer.splice(0);

    try {
      await this.batchInsert(events);
    } catch (error) {
      logger.error('Failed to insert analytics events', { error, count: events.length });
      // Re-add events to buffer for retry
      this.buffer.unshift(...events);
    } finally {
      this.isProcessing = false;
    }
  }

  /**
   * Start periodic flush
   */
  private startProcessor(): void {
    this.timer = setInterval(() => {
      this.flush();
    }, this.flushInterval);
  }

  /**
   * Batch insert events using optimized utility
   */
  private async batchInsert(events: AnalyticsEvent[]): Promise<void> {
    if (events.length === 0) return;

    // Transform events for batch insert
    const records = events.map((e) => ({
      user_id: e.userId,
      session_id: e.sessionId,
      event_type: e.eventType,
      event_name: e.eventName,
      properties: JSON.stringify(e.properties || {}),
      timestamp: e.timestamp,
      user_agent: e.userAgent,
      ip: e.ip,
      referrer: e.referrer,
      game_id: e.gameId,
    }));

    await batchInsert(this.db, 'analytics_events', records, this.bufferSize);
  }

  /**
   * Stop the processor
   */
  stop(): void {
    if (this.timer) {
      clearInterval(this.timer);
    }
    this.flush();
  }
}

export class AnalyticsServiceV2 {
  private db: DatabaseProvider;
  private eventProcessor: EventProcessor;
  private metricsCache = new Map<string, { data: any; expiry: number }>();
  private cacheTTL = 300000; // 5 minutes

  constructor(db: DatabaseProvider, bufferSize = 1000, flushInterval = 5000) {
    this.db = db;
    this.eventProcessor = new EventProcessor(db, bufferSize, flushInterval);
    this.initializeSchema();
  }

  /**
   * Initialize database schema with proper indexes
   */
  private async initializeSchema(): Promise<void> {
    try {
      // Events table
      await this.db.query(`
        CREATE TABLE IF NOT EXISTS analytics_events (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          user_id TEXT,
          session_id TEXT NOT NULL,
          event_type TEXT NOT NULL,
          event_name TEXT NOT NULL,
          properties TEXT,
          timestamp INTEGER NOT NULL,
          user_agent TEXT,
          ip TEXT,
          referrer TEXT,
          game_id TEXT,
          created_at DATETIME DEFAULT CURRENT_TIMESTAMP
        )
      `);

      // Indexes for performance
      await this.db.query(`
        CREATE INDEX IF NOT EXISTS idx_events_user_id ON analytics_events(user_id)
      `);
      await this.db.query(`
        CREATE INDEX IF NOT EXISTS idx_events_timestamp ON analytics_events(timestamp)
      `);
      await this.db.query(`
        CREATE INDEX IF NOT EXISTS idx_events_type ON analytics_events(event_type)
      `);
      await this.db.query(`
        CREATE INDEX IF NOT EXISTS idx_events_game_type ON analytics_events(game_id)
      `);

      // Game analytics table
      await this.db.query(`
        CREATE TABLE IF NOT EXISTS game_analytics (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          game_id TEXT NOT NULL,
          game_type TEXT NOT NULL,
          user_id TEXT NOT NULL,
          opponent_id TEXT,
          moves_count INTEGER NOT NULL,
          duration INTEGER NOT NULL,
          result TEXT NOT NULL,
          is_ranked BOOLEAN DEFAULT FALSE,
          final_board TEXT,
          created_at DATETIME DEFAULT CURRENT_TIMESTAMP
        )
      `);

      // User metrics table (cached)
      await this.db.query(`
        CREATE TABLE IF NOT EXISTS user_metrics (
          user_id TEXT PRIMARY KEY,
          total_games INTEGER DEFAULT 0,
          total_wins INTEGER DEFAULT 0,
          total_losses INTEGER DEFAULT 0,
          total_draws INTEGER DEFAULT 0,
          favorite_game_type TEXT,
          average_game_duration INTEGER DEFAULT 0,
          win_rate REAL DEFAULT 0,
          last_active DATETIME,
          total_play_time INTEGER DEFAULT 0,
          current_streak INTEGER DEFAULT 0,
          best_streak INTEGER DEFAULT 0,
          rating INTEGER,
          updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
        )
      `);

      // Daily stats table for time-series analysis
      await this.db.query(`
        CREATE TABLE IF NOT EXISTS daily_stats (
          date DATE PRIMARY KEY,
          active_users INTEGER DEFAULT 0,
          new_users INTEGER DEFAULT 0,
          total_games INTEGER DEFAULT 0,
          total_events INTEGER DEFAULT 0,
          avg_session_duration INTEGER DEFAULT 0,
          retention_rate REAL DEFAULT 0,
          created_at DATETIME DEFAULT CURRENT_TIMESTAMP
        )
      `);

      logger.info('Analytics schema initialized');
    } catch (error) {
      logger.error('Failed to initialize analytics schema', { error });
      throw error;
    }
  }

  /**
   * Track an event
   */
  trackEvent(event: AnalyticsEvent): void {
    this.eventProcessor.add(event);
  }

  /**
   * Track game analytics
   */
  async trackGameAnalytics(game: GameAnalytics): Promise<void> {
    try {
      await this.db.query(
        `
        INSERT INTO game_analytics (
          game_id, game_type, user_id, opponent_id,
          moves_count, duration, result, is_ranked, final_board
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
      `,
        [
          game.gameId,
          game.gameType,
          game.userId,
          game.opponentId || null,
          game.movesCount,
          game.duration,
          game.result,
          game.isRanked,
          JSON.stringify(game.finalBoard),
        ]
      );

      // Update user metrics asynchronously
      this.updateUserMetrics(game.userId).catch((error) => {
        logger.error('Failed to update user metrics', { error, userId: game.userId });
      });
    } catch (error) {
      logger.error('Failed to track game analytics', { error, gameId: game.gameId });
    }
  }

  /**
   * Query analytics events
   */
  async queryEvents(query: AnalyticsQuery): Promise<any[]> {
    const cacheKey = JSON.stringify(query);
    const cached = this.metricsCache.get(cacheKey);

    if (cached && cached.expiry > Date.now()) {
      return cached.data;
    }

    try {
      let sql = 'SELECT * FROM analytics_events WHERE 1=1';
      const params: any[] = [];

      // Build dynamic query
      if (query.userId) {
        sql += ' AND user_id = ?';
        params.push(query.userId);
      }

      if (query.eventTypes?.length) {
        sql += ` AND event_type IN (${query.eventTypes.map(() => '?').join(',')})`;
        params.push(...query.eventTypes);
      }

      if (query.startDate) {
        sql += ' AND timestamp >= ?';
        params.push(query.startDate.getTime());
      }

      if (query.endDate) {
        sql += ' AND timestamp <= ?';
        params.push(query.endDate.getTime());
      }

      if (query.gameId) {
        sql += ' AND game_id = ?';
        params.push(query.gameId);
      }

      // Add ordering and pagination
      sql += ' ORDER BY timestamp DESC';

      if (query.limit) {
        sql += ' LIMIT ?';
        params.push(query.limit);
      }

      if (query.offset) {
        sql += ' OFFSET ?';
        params.push(query.offset);
      }

      const results = await this.db.query(sql, params);

      // Parse JSON properties
      const parsed = results.map((row) => ({
        ...row,
        properties: row.properties ? JSON.parse(row.properties) : null,
      }));

      // Cache results
      this.metricsCache.set(cacheKey, {
        data: parsed,
        expiry: Date.now() + this.cacheTTL,
      });

      return parsed;
    } catch (error) {
      logger.error('Failed to query analytics events', { error, query });
      throw error;
    }
  }

  /**
   * Get user metrics with caching
   */
  async getUserMetrics(userId: string): Promise<UserMetrics | null> {
    const cacheKey = `user_metrics:${userId}`;
    const cached = this.metricsCache.get(cacheKey);

    if (cached && cached.expiry > Date.now()) {
      return cached.data;
    }

    try {
      const result = await this.db.query(
        `
        SELECT * FROM user_metrics WHERE user_id = ?
      `,
        [userId]
      );

      const metrics = result[0];
      if (metrics) {
        this.metricsCache.set(cacheKey, {
          data: metrics,
          expiry: Date.now() + this.cacheTTL,
        });
        return metrics;
      }

      return null;
    } catch (error) {
      logger.error('Failed to get user metrics', { error, userId });
      return null;
    }
  }

  /**
   * Update user metrics (optimized for batch updates)
   */
  private async updateUserMetrics(userId: string): Promise<void> {
    // This should be optimized with a proper aggregation query
    // For now, a simplified version
    try {
      const gameStats = await this.db.query(
        `
        SELECT
          COUNT(*) as total_games,
          SUM(CASE WHEN result = 'win' THEN 1 ELSE 0 END) as wins,
          SUM(CASE WHEN result = 'lose' THEN 1 ELSE 0 END) as losses,
          SUM(CASE WHEN result = 'draw' THEN 1 ELSE 0 END) as draws,
          AVG(duration) as avg_duration,
          game_type
        FROM game_analytics
        WHERE user_id = ?
        AND created_at > datetime('now', '-30 days')
        GROUP BY game_type
        ORDER BY COUNT(*) DESC
        LIMIT 1
      `,
        [userId]
      );

      if (gameStats[0]) {
        const stats = gameStats[0];
        const winRate = stats.total_games > 0 ? (stats.wins / stats.total_games) * 100 : 0;

        await this.db.query(
          `
          INSERT OR REPLACE INTO user_metrics (
            user_id, total_games, total_wins, total_losses,
            total_draws, favorite_game_type, average_game_duration,
            win_rate, last_active, updated_at
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, datetime('now'), datetime('now'))
        `,
          [
            userId,
            stats.total_games,
            stats.wins,
            stats.losses,
            stats.draws,
            stats.game_type,
            Math.round(stats.avg_duration),
            winRate.toFixed(2),
          ]
        );

        // Invalidate cache
        this.metricsCache.delete(`user_metrics:${userId}`);
      }
    } catch (error) {
      logger.error('Failed to update user metrics', { error, userId });
    }
  }

  /**
   * Get platform statistics
   */
  async getPlatformStats(): Promise<AnalyticsStats> {
    const cacheKey = 'platform_stats';
    const cached = this.metricsCache.get(cacheKey);

    if (cached && cached.expiry > Date.now()) {
      return cached.data;
    }

    try {
      const [events, users, games, gameTypes] = await Promise.all([
        this.db.query('SELECT COUNT(*) as count FROM analytics_events'),
        this.db.query('SELECT COUNT(DISTINCT user_id) as count FROM analytics_events'),
        this.db.query('SELECT COUNT(*) as count FROM game_analytics'),
        this.db.query(`
          SELECT game_type, COUNT(*) as count
          FROM game_analytics
          GROUP BY game_type
          ORDER BY count DESC
          LIMIT 5
        `),
      ]);

      const stats: AnalyticsStats = {
        totalEvents: events[0]?.count || 0,
        uniqueUsers: users[0]?.count || 0,
        totalGames: games[0]?.count || 0,
        popularGameTypes: gameTypes,
        averageSessionDuration: 0, // TODO: Calculate from session data
        retentionRate: 0, // TODO: Calculate from cohort analysis
        dailyActiveUsers: 0, // TODO: Calculate from daily stats
        monthlyActiveUsers: 0, // TODO: Calculate from daily stats
      };

      this.metricsCache.set(cacheKey, {
        data: stats,
        expiry: Date.now() + this.cacheTTL,
      });

      return stats;
    } catch (error) {
      logger.error('Failed to get platform stats', { error });
      throw error;
    }
  }

  /**
   * Cleanup old data
   */
  async cleanup(retentionDays = 90): Promise<void> {
    try {
      const cutoffDate = new Date();
      cutoffDate.setDate(cutoffDate.getDate() - retentionDays);
      const cutoffTimestamp = cutoffDate.getTime();

      const [events, games] = await Promise.all([
        this.db.query('DELETE FROM analytics_events WHERE timestamp < ?', [cutoffTimestamp]),
        this.db.query('DELETE FROM game_analytics WHERE created_at < datetime(?)', [
          cutoffDate.toISOString(),
        ]),
      ]);

      logger.info('Analytics cleanup completed', {
        retentionDays,
        eventsDeleted: events.changes || 0,
        gamesDeleted: games.changes || 0,
      });
    } catch (error) {
      logger.error('Failed to cleanup analytics data', { error });
    }
  }

  /**
   * Shutdown the service
   */
  async shutdown(): Promise<void> {
    this.eventProcessor.stop();
    this.metricsCache.clear();
  }
}
