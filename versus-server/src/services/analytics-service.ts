import { DatabaseProvider } from '../core/database.js';
import { logger } from '../utils/logger.js';

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
}

export interface GameAnalytics {
  gameId: string;
  gameType: string;
  userId: string;
  movesCount: number;
  duration: number;
  result: 'win' | 'lose' | 'draw' | 'abandoned';
  opponentId?: string;
  isRanked: boolean;
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
}

export class AnalyticsService {
  private db: DatabaseProvider;
  private eventQueue: AnalyticsEvent[] = [];
  private batchSize = 100;
  private flushInterval = 5000; // 5 seconds

  constructor(db: DatabaseProvider) {
    this.db = db;
    this.initializeSchema();
    this.startBatchProcessor();
  }

  /**
   * Initialize database schema for analytics
   */
  private async initializeSchema(): Promise<void> {
    try {
      // Events table
      await this.db.execute(`
        CREATE TABLE IF NOT EXISTS analytics_events (
          id SERIAL PRIMARY KEY,
          user_id VARCHAR(255),
          session_id VARCHAR(255) NOT NULL,
          event_type VARCHAR(100) NOT NULL,
          event_name VARCHAR(100) NOT NULL,
          properties JSONB,
          timestamp BIGINT NOT NULL,
          user_agent TEXT,
          ip INET,
          referrer TEXT,
          created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        )
      `);

      // Game analytics table
      await this.db.execute(`
        CREATE TABLE IF NOT EXISTS game_analytics (
          id SERIAL PRIMARY KEY,
          game_id VARCHAR(255) NOT NULL,
          game_type VARCHAR(100) NOT NULL,
          user_id VARCHAR(255) NOT NULL,
          opponent_id VARCHAR(255),
          moves_count INTEGER NOT NULL,
          duration INTEGER NOT NULL,
          result VARCHAR(20) NOT NULL,
          is_ranked BOOLEAN DEFAULT FALSE,
          created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        )
      `);

      // User metrics table (materialized view)
      await this.db.execute(`
        CREATE TABLE IF NOT EXISTS user_metrics (
          user_id VARCHAR(255) PRIMARY KEY,
          total_games INTEGER DEFAULT 0,
          total_wins INTEGER DEFAULT 0,
          total_losses INTEGER DEFAULT 0,
          total_draws INTEGER DEFAULT 0,
          favorite_game_type VARCHAR(100),
          average_game_duration INTEGER DEFAULT 0,
          win_rate DECIMAL(5,2) DEFAULT 0,
          last_active TIMESTAMP,
          total_play_time INTEGER DEFAULT 0,
          updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        )
      `);

      // API usage tracking
      await this.db.execute(`
        CREATE TABLE IF NOT EXISTS api_usage (
          id SERIAL PRIMARY KEY,
          user_id VARCHAR(255),
          endpoint VARCHAR(255) NOT NULL,
          method VARCHAR(10) NOT NULL,
          status_code INTEGER NOT NULL,
          response_time INTEGER NOT NULL,
          timestamp BIGINT NOT NULL,
          created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        )
      `);

      // Create indexes for performance
      await this.db.execute(`
        CREATE INDEX IF NOT EXISTS idx_analytics_events_user_id ON analytics_events(user_id);
        CREATE INDEX IF NOT EXISTS idx_analytics_events_timestamp ON analytics_events(timestamp);
        CREATE INDEX IF NOT EXISTS idx_analytics_events_type ON analytics_events(event_type, event_name);
        CREATE INDEX IF NOT EXISTS idx_game_analytics_user_id ON game_analytics(user_id);
        CREATE INDEX IF NOT EXISTS idx_game_analytics_game_type ON game_analytics(game_type);
        CREATE INDEX IF NOT EXISTS idx_api_usage_user_id ON api_usage(user_id);
        CREATE INDEX IF NOT EXISTS idx_api_usage_timestamp ON api_usage(timestamp);
      `);

      logger.info('Analytics schema initialized');
    } catch (error) {
      logger.error('Failed to initialize analytics schema', { error });
      throw error;
    }
  }

  /**
   * Track an analytics event
   */
  track(event: Omit<AnalyticsEvent, 'timestamp'>): void {
    this.eventQueue.push({
      ...event,
      timestamp: Date.now(),
    });

    if (this.eventQueue.length >= this.batchSize) {
      this.flushEvents();
    }
  }

  /**
   * Track game completion
   */
  async trackGame(gameAnalytics: GameAnalytics): Promise<void> {
    try {
      await this.db.execute(
        `
        INSERT INTO game_analytics (
          game_id, game_type, user_id, opponent_id, moves_count,
          duration, result, is_ranked
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
      `,
        [
          gameAnalytics.gameId,
          gameAnalytics.gameType,
          gameAnalytics.userId,
          gameAnalytics.opponentId,
          gameAnalytics.movesCount,
          gameAnalytics.duration,
          gameAnalytics.result,
          gameAnalytics.isRanked,
        ]
      );

      // Update user metrics
      await this.updateUserMetrics(gameAnalytics.userId);

      logger.debug('Game analytics tracked', { gameId: gameAnalytics.gameId });
    } catch (error) {
      logger.error('Failed to track game analytics', { error, gameAnalytics });
    }
  }

  /**
   * Track API usage
   */
  async trackApiUsage(
    userId: string | undefined,
    endpoint: string,
    method: string,
    statusCode: number,
    responseTime: number
  ): Promise<void> {
    try {
      await this.db.execute(
        `
        INSERT INTO api_usage (user_id, endpoint, method, status_code, response_time, timestamp)
        VALUES ($1, $2, $3, $4, $5, $6)
      `,
        [userId, endpoint, method, statusCode, responseTime, Date.now()]
      );
    } catch (error) {
      logger.error('Failed to track API usage', { error, endpoint, userId });
    }
  }

  /**
   * Get user metrics
   */
  async getUserMetrics(userId: string): Promise<UserMetrics | null> {
    try {
      const result = await this.db.get('SELECT * FROM user_metrics WHERE user_id = $1', [userId]);

      if (!result) {
        return null;
      }

      return {
        userId: result.user_id,
        totalGames: result.total_games,
        totalWins: result.total_wins,
        totalLosses: result.total_losses,
        totalDraws: result.total_draws,
        favoriteGameType: result.favorite_game_type,
        averageGameDuration: result.average_game_duration,
        winRate: parseFloat(result.win_rate),
        lastActive: result.last_active,
        totalPlayTime: result.total_play_time,
      };
    } catch (error) {
      logger.error('Failed to get user metrics', { error, userId });
      return null;
    }
  }

  /**
   * Get game statistics
   */
  async getGameStats(gameType?: string, timeRange: number = 30): Promise<any> {
    try {
      const timeFilter = Date.now() - timeRange * 24 * 60 * 60 * 1000;

      let query = `
        SELECT
          game_type,
          COUNT(*) as total_games,
          AVG(duration) as avg_duration,
          AVG(moves_count) as avg_moves,
          COUNT(CASE WHEN result = 'win' THEN 1 END) as wins,
          COUNT(CASE WHEN result = 'lose' THEN 1 END) as losses,
          COUNT(CASE WHEN result = 'draw' THEN 1 END) as draws
        FROM game_analytics
        WHERE timestamp > $1
      `;

      const params = [timeFilter];

      if (gameType) {
        query += ' AND game_type = $2';
        params.push(gameType);
      }

      query += ' GROUP BY game_type ORDER BY total_games DESC';

      const results = await this.db.all(query, params);
      return results;
    } catch (error) {
      logger.error('Failed to get game stats', { error, gameType });
      return [];
    }
  }

  /**
   * Get platform analytics
   */
  async getPlatformAnalytics(timeRange: number = 30): Promise<any> {
    try {
      const timeFilter = Date.now() - timeRange * 24 * 60 * 60 * 1000;

      // Active users
      const activeUsers = await this.db.get(
        'SELECT COUNT(DISTINCT user_id) as count FROM analytics_events WHERE timestamp > $1',
        [timeFilter]
      );

      // Total sessions
      const totalSessions = await this.db.get(
        'SELECT COUNT(DISTINCT session_id) as count FROM analytics_events WHERE timestamp > $1',
        [timeFilter]
      );

      // Most popular games
      const popularGames = await this.db.all(
        `
        SELECT
          properties->>'gameType' as game_type,
          COUNT(*) as plays
        FROM analytics_events
        WHERE event_name = 'game_started' AND timestamp > $1
        GROUP BY properties->>'gameType'
        ORDER BY plays DESC
        LIMIT 10
      `,
        [timeFilter]
      );

      // Revenue (if available)
      const revenue = await this.db.get(
        `
        SELECT SUM(properties->>'amount'::numeric) as total
        FROM analytics_events
        WHERE event_name = 'payment_completed' AND timestamp > $1
      `,
        [timeFilter]
      );

      // Retention rate
      const returningUsers = await this.db.get(
        `
        WITH user_sessions AS (
          SELECT user_id, COUNT(DISTINCT DATE(created_at)) as session_days
          FROM analytics_events
          WHERE timestamp > $1 AND user_id IS NOT NULL
          GROUP BY user_id
        )
        SELECT
          COUNT(CASE WHEN session_days > 1 THEN 1 END) as returning,
          COUNT(*) as total,
          (COUNT(CASE WHEN session_days > 1 THEN 1 END) * 100.0 / COUNT(*)) as retention_rate
        FROM user_sessions
      `,
        [timeFilter]
      );

      return {
        activeUsers: activeUsers?.count || 0,
        totalSessions: totalSessions?.count || 0,
        popularGames,
        revenue: revenue?.total || 0,
        retention: {
          returning: returningUsers?.returning || 0,
          total: returningUsers?.total || 0,
          rate: parseFloat(returningUsers?.retention_rate || '0'),
        },
      };
    } catch (error) {
      logger.error('Failed to get platform analytics', { error });
      return null;
    }
  }

  /**
   * Get API usage statistics
   */
  async getApiUsageStats(userId?: string, timeRange: number = 30): Promise<any> {
    try {
      const timeFilter = Date.now() - timeRange * 24 * 60 * 60 * 1000;

      let query = `
        SELECT
          endpoint,
          COUNT(*) as requests,
          AVG(response_time) as avg_response_time,
          MAX(response_time) as max_response_time,
          COUNT(CASE WHEN status_code >= 400 THEN 1 END) as errors
        FROM api_usage
        WHERE timestamp > $1
      `;

      const params = [timeFilter];

      if (userId) {
        query += ' AND user_id = $2';
        params.push(userId);
      }

      query += ' GROUP BY endpoint ORDER BY requests DESC LIMIT 20';

      const results = await this.db.all(query, params);
      return results;
    } catch (error) {
      logger.error('Failed to get API usage stats', { error, userId });
      return [];
    }
  }

  /**
   * Update user metrics based on game completion
   */
  private async updateUserMetrics(userId: string): Promise<void> {
    try {
      // Calculate metrics from game history
      const stats = await this.db.get(
        `
        SELECT
          COUNT(*) as total_games,
          COUNT(CASE WHEN result = 'win' THEN 1 END) as total_wins,
          COUNT(CASE WHEN result = 'lose' THEN 1 END) as total_losses,
          COUNT(CASE WHEN result = 'draw' THEN 1 END) as total_draws,
          AVG(duration) as avg_duration,
          SUM(duration) as total_play_time,
          game_type
        FROM (
          SELECT *,
            ROW_NUMBER() OVER (PARTITION BY game_type ORDER BY created_at DESC) as rn
          FROM game_analytics
          WHERE user_id = $1
        ) ranked
        WHERE rn = 1
        GROUP BY game_type
        ORDER BY COUNT(*) DESC
        LIMIT 1
      `,
        [userId]
      );

      if (stats) {
        const winRate = stats.total_games > 0 ? (stats.total_wins / stats.total_games) * 100 : 0;

        await this.db.execute(
          `
          INSERT INTO user_metrics (
            user_id, total_games, total_wins, total_losses, total_draws,
            favorite_game_type, average_game_duration, win_rate,
            total_play_time, last_active, updated_at
          ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
          ON CONFLICT (user_id) DO UPDATE SET
            total_games = EXCLUDED.total_games,
            total_wins = EXCLUDED.total_wins,
            total_losses = EXCLUDED.total_losses,
            total_draws = EXCLUDED.total_draws,
            favorite_game_type = EXCLUDED.favorite_game_type,
            average_game_duration = EXCLUDED.average_game_duration,
            win_rate = EXCLUDED.win_rate,
            total_play_time = EXCLUDED.total_play_time,
            last_active = EXCLUDED.last_active,
            updated_at = EXCLUDED.updated_at
        `,
          [
            userId,
            stats.total_games,
            stats.total_wins,
            stats.total_losses,
            stats.total_draws,
            stats.game_type,
            Math.round(stats.avg_duration),
            winRate,
            stats.total_play_time,
            new Date(),
            new Date(),
          ]
        );
      }
    } catch (error) {
      logger.error('Failed to update user metrics', { error, userId });
    }
  }

  /**
   * Start batch processor for events
   */
  private startBatchProcessor(): void {
    setInterval(() => {
      if (this.eventQueue.length > 0) {
        this.flushEvents();
      }
    }, this.flushInterval);
  }

  /**
   * Flush queued events to database
   */
  private async flushEvents(): Promise<void> {
    if (this.eventQueue.length === 0) return;

    const events = [...this.eventQueue];
    this.eventQueue = [];

    try {
      const values = events
        .map(
          (e) =>
            `('${e.userId}', '${e.sessionId}', '${e.eventType}', '${e.eventName}',
           '${JSON.stringify(e.properties || {})}', ${e.timestamp},
           '${e.userAgent || ''}', '${e.ip || ''}', '${e.referrer || ''}')`
        )
        .join(',');

      await this.db.execute(`
        INSERT INTO analytics_events (
          user_id, session_id, event_type, event_name, properties,
          timestamp, user_agent, ip, referrer
        ) VALUES ${values}
      `);

      logger.debug(`Flushed ${events.length} analytics events`);
    } catch (error) {
      logger.error('Failed to flush analytics events', { error });
      // Re-add events to queue for retry
      this.eventQueue.unshift(...events);
    }
  }

  /**
   * Create analytics report
   */
  async createReport(type: 'user' | 'game' | 'platform' | 'api', params?: any): Promise<any> {
    switch (type) {
      case 'user':
        if (!params?.userId) throw new Error('User ID required for user report');
        return await this.getUserMetrics(params.userId);

      case 'game':
        return await this.getGameStats(params?.gameType, params?.timeRange);

      case 'platform':
        return await this.getPlatformAnalytics(params?.timeRange);

      case 'api':
        return await this.getApiUsageStats(params?.userId, params?.timeRange);

      default:
        throw new Error(`Unknown report type: ${type}`);
    }
  }
}
